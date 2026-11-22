import { ApprovalStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { gradeRepository, GradeWithStudent } from '../repositories/grade.repository';
import { auditService } from './audit.service';
import { notificationService } from './notification.service';
import { studentWorkflowService } from './studentWorkflow.service';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import {
  PENILAIAN_GROUPS,
  PENILAIAN_ITEMS,
  PENILAIAN_LEGEND,
  PENILAIAN_SCALE,
  PENILAIAN_FOOTNOTE,
  PENILAIAN_WEIGHTS,
  PREDICATE_OF,
  averageAspectScore,
  computeFinalScore,
} from '../config/penilaian.config';
import { ApproveGradeDTO, CreateGradeDTO } from '../validators/phase4.validator';
import { resolveScope, scopeUserWhere, andWhere } from './majorScope.service';

const ENTITY_GRADE = 'GRADE';

/** Definisi form penilaian — sumber tunggal untuk frontend, PDF, dan validasi. */
export const PenilaianForm = {
  groups: PENILAIAN_GROUPS,
  items: PENILAIAN_ITEMS,
  /** Ambang predikat numerik — frontend menghitung pratinjau Nilai Akhir dari sini. */
  scale: PENILAIAN_SCALE.map((s) => ({ ...s })),
  legend: PENILAIAN_LEGEND,
  weights: PENILAIAN_WEIGHTS,
  footnote: PENILAIAN_FOOTNOTE,
};

export type GradeApprovalInfo = {
  id: string;
  status: ApprovalStatus;
  actorId: string | null;
  note: string | null;
  actedAt: Date | null;
};

type GradeWithApproval<T extends { id: string }> = T & { approval: GradeApprovalInfo | null };

/** Satu baris siswa pada rekap per kelas — `grade` null bila belum dinilai. */
export type GradeRecapStudent = {
  userId: string;
  username: string;
  fullName: string;
  nisn: string | null;
  companyName: string | null;
  supervisorName: string | null;
  approvalStatus: ApprovalStatus | null;
  grade: GradeWithStudent | null;
};

export type GradeRecapClass = {
  className: string;
  studentCount: number;
  gradedCount: number;
  students: GradeRecapStudent[];
};

export type GradeRecapByClass = {
  classes: GradeRecapClass[];
  totalStudents: number;
  totalGraded: number;
};

/**
 * Service penilaian PKL (Fase 4).
 *
 * Alur per-orang: siswa menginput nilai DUDI sendiri pada fase Pasca PKL,
 * lalu admin menyetujui/menolak lewat halaman Rekap Penilaian.
 */
export class GradeService {
  /** Definisi form penilaian (butir, rentang predikat, bobot) — satu sumber utk FE, BE, dan PDF. */
  getForm() {
    return PenilaianForm;
  }

  /** Input nilai akhir PKL (mewakili nilai DUDI). Siswa hanya untuk dirinya sendiri; admin dapat membantu. */
  async inputGrade(
    actorId: string,
    dto: CreateGradeDTO,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    // Siswa menginput nilai untuk dirinya sendiri — studentId boleh dihilangkan
    // dari payload dan diambil dari token; admin mengirim studentId eksplisit.
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });
    if (!actor) throw new NotFoundError('Penginput nilai tidak ditemukan');
    const studentId = dto.studentId ?? (actor.role === Role.SISWA ? actorId : undefined);
    if (!studentId) throw new BadRequestError('Siswa wajib ditentukan');

    // Sinkronkan fase efektif berdasarkan jadwal cohort terlebih dahulu.
    await studentWorkflowService.syncScheduledPhase(studentId);
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        phase: true,
        studentProfile: {
          select: {
            fullName: true,
            majorId: true,
            class: { select: { majorId: true } },
          },
        },
      },
    });
    if (!student) throw new NotFoundError('Siswa tidak ditemukan');
    if (student.role !== Role.SISWA) throw new BadRequestError('ID harus merujuk ke siswa');

    if (actor.role === Role.SISWA) {
      if (actorId !== studentId) {
        throw new BadRequestError('Anda hanya dapat menginput nilai untuk diri sendiri');
      }
      if (student.phase !== 'PKL_SELESAI') {
        throw new BadRequestError('Nilai hanya dapat diinput setelah siswa menyelesaikan PKL');
      }
    }

    // Nilai yang sudah dikirim TERKUNCI — siswa tidak bisa mengubahnya lagi.
    // Celah pembuka satu-satunya: admin menolak nilai tersebut.
    const existing = await gradeRepository.findUnique(studentId, Role.DUDI);
    if (existing?.submittedAt && actor.role === Role.SISWA) {
      const latest = await prisma.approval.findFirst({
        where: { entityType: ENTITY_GRADE, entityId: existing.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      if (latest?.status !== ApprovalStatus.DITOLAK) {
        throw new BadRequestError(
          'Nilai sudah dikirim dan tidak dapat diubah lagi. Hubungi admin bila ada koreksi.'
        );
      }
    }

    // Label butir selalu diambil dari konfigurasi — bunyi dari klien diabaikan.
    const aspects = PENILAIAN_ITEMS.map((item) => {
      const sent = dto.items.find((i) => i.groupCode === item.groupCode && i.code === item.code);
      if (!sent) throw new BadRequestError(`Butir ${item.groupCode}${item.code} belum diisi`);
      return { groupCode: item.groupCode, code: item.code, label: item.label, score: sent.score };
    });

    const aspectsAverage = averageAspectScore(aspects.map((a) => a.score));
    const finalScore = computeFinalScore(aspectsAverage, dto.scoreReport);
    const predicate = PREDICATE_OF(finalScore).letter;
    const submittedAt = new Date();

    const grade = await gradeRepository.upsertByStudentAndGiver(
      studentId,
      Role.DUDI,
      {
        student: { connect: { id: studentId } },
        giver: { connect: { id: actorId } },
        giverRole: Role.DUDI,
        scoreDudi: aspectsAverage,
        scoreReport: dto.scoreReport,
        finalScore,
        predicate,
        mentorName: dto.mentorName,
        note: dto.note ?? null,
        submittedAt,
      },
      {
        scoreDudi: aspectsAverage,
        scoreReport: dto.scoreReport,
        finalScore,
        predicate,
        mentorName: dto.mentorName,
        note: dto.note ?? null,
        submittedAt,
        giver: { connect: { id: actorId } },
      }
    );

    // Simpan rincian butir LEMBARAN PENILAIAN (ganti totalitas saat kirim/revisi).
    await prisma.$transaction([
      prisma.gradeAspect.deleteMany({ where: { gradeId: grade.id } }),
      prisma.gradeAspect.createMany({
        data: aspects.map((a) => ({
          gradeId: grade.id,
          label: a.label,
          score: a.score,
          code: a.code,
          groupCode: a.groupCode,
        })),
      }),
    ]);

    // Input baru = menunggu persetujuan admin lagi.
    await this.resetApproval(grade.id);

    // Kabari admin yang mengawasi jurusan siswa ini (SUPER_ADMIN: semua jurusan).
    const studentMajorId =
      student.studentProfile?.majorId ?? student.studentProfile?.class?.majorId ?? null;
    const reviewers = await prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
        deletedAt: null,
        isActive: true,
        ...(studentMajorId
          ? {
              OR: [
                { role: Role.SUPER_ADMIN },
                { supervisedMajors: { some: { id: studentMajorId } } },
              ],
            }
          : { role: Role.SUPER_ADMIN }),
      },
      select: { id: true },
    });
    const studentName = student.studentProfile?.fullName ?? 'Seorang siswa';
    for (const reviewer of reviewers) {
      if (reviewer.id === actorId) continue;
      await notificationService.create(
        reviewer.id,
        'Nilai PKL menunggu persetujuan',
        `${studentName} mengirim nilai PKL. Mohon tinjau di Rekap Penilaian.`,
        'GRADE',
        '/admin/penilaian'
      );
    }

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GRADE,
      entityType: ENTITY_TYPES.USER,
      entityId: studentId,
      metadata: { finalScore, predicate, mentorName: dto.mentorName, gradeId: grade.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return gradeRepository.findById(grade.id);
  }

  /** Admin: setujui/tolak nilai yang diinput siswa. */
  async approveGrade(
    actorId: string,
    gradeId: string,
    dto: ApproveGradeDTO,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const grade = await gradeRepository.findById(gradeId);
    if (!grade) throw new NotFoundError(MESSAGES.NOT_FOUND);
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor) throw new NotFoundError('Pengguna tidak ditemukan');

    // Scope jurusan: ADMIN hanya boleh memutuskan nilai siswa jurusan yang diawasinya.
    if (actor.role === Role.ADMIN) {
      const scope = await resolveScope({ id: actorId, role: Role.ADMIN });
      const scoped = scopeUserWhere(scope, 'student');
      if (scoped) {
        const allowed = await prisma.grade.findFirst({
          where: andWhere({ id: gradeId }, scoped) as Prisma.GradeWhereInput,
          select: { id: true },
        });
        if (!allowed) throw new BadRequestError(MESSAGES.SCOPE);
      }
    }

    const status: ApprovalStatus = dto.approved ? 'DISETUJUI' : 'DITOLAK';
    const approval = await this.decideApproval(grade.id, status, actorId, dto.note ?? null);

    const studentName = grade.student.studentProfile?.fullName ?? 'Siswa';
    await notificationService.create(
      grade.studentId,
      dto.approved ? 'Nilai PKL disetujui' : 'Nilai PKL ditolak',
      dto.approved
        ? `Nilai PKL Anda disetujui oleh admin.`
        : `Nilai PKL Anda ditolak${dto.note ? `: ${dto.note}` : '. Mohon perbaiki data nilai.'}`,
      'GRADE',
      '/penilaian'
    );

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GRADE,
      entityType: ENTITY_TYPES.USER,
      entityId: grade.studentId,
      metadata: { approval: status, gradeId, studentName },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { ...grade, approval };
  }

  /** Siswa: lihat rekap nilai sendiri (termasuk status persetujuan). */
  async getMyGrades(studentId: string): Promise<Array<GradeWithApproval<GradeWithStudent>>> {
    const items = await gradeRepository.findMany({ studentId });
    return this.attachApprovals(items);
  }

  /** Admin: daftar nilai (dibatasi jurusan yang diawasi utk ADMIN). */
  async list(
    params: { page: number; perPage: number; studentId?: string },
    actor: { id: string; role: string }
  ): Promise<{ items: Array<GradeWithApproval<GradeWithStudent>>; total: number }> {
    let where: Prisma.GradeWhereInput = {
      ...(params.studentId ? { studentId: params.studentId } : {}),
    };

    // Scope jurusan: ADMIN hanya nilai milik siswa dalam jurusan yang diawasi.
    if (actor.role === Role.ADMIN) {
      const scope = await resolveScope({ id: actor.id, role: Role.ADMIN });
      const scoped = scopeUserWhere(scope, 'student');
      if (scoped) {
        where = andWhere(where as Record<string, unknown>, scoped) as Prisma.GradeWhereInput;
      }
    }

    const { items, total } = await gradeRepository.paginate(
      where,
      (params.page - 1) * params.perPage,
      params.perPage
    );
    return { items: await this.attachApprovals(items), total };
  }

  /** Admin: rekap semua nilai (dibatasi jurusan yang diawasi utk ADMIN). */
  async getRecap(actor?: { id: string; role: string }): Promise<Array<GradeWithApproval<GradeWithStudent>>> {
    let where: Prisma.GradeWhereInput = {};
    if (actor && actor.role === Role.ADMIN) {
      const scope = await resolveScope({ id: actor.id, role: Role.ADMIN });
      const scoped = scopeUserWhere(scope, 'student');
      if (scoped) {
        where = andWhere(where as Record<string, unknown>, scoped) as Prisma.GradeWhereInput;
      }
    }
    const items = await gradeRepository.findMany(where);
    return this.attachApprovals(items);
  }

  /**
   * Admin: rekap penilaian per kelas → siswa.
   * Sumber = seluruh siswa aktif cohort, termasuk yang belum dinilai (`grade: null`),
   * lengkap dengan perusahaan tujuan dan guru pembimbing.
   */
  async getRecapByClass(
    params?: { cohortId?: string },
    actor?: { id: string; role: string }
  ): Promise<GradeRecapByClass> {
    // Scope jurusan: ADMIN hanya siswa dalam jurusan yang diawasi.
    let userScopeWhere: Prisma.UserWhereInput = {};
    if (actor && actor.role === Role.ADMIN) {
      const scope = await resolveScope({ id: actor.id, role: Role.ADMIN });
      if (!('all' in scope)) {
        const majorIds = scope.majorIds;
        userScopeWhere = {
          studentProfile:
            majorIds.length === 0
              ? { id: { in: [] } }
              : { OR: [{ majorId: { in: majorIds } }, { class: { majorId: { in: majorIds } } }] },
        };
      }
    }

    const students = await prisma.user.findMany({
      where: {
        role: Role.SISWA,
        deletedAt: null,
        ...(params?.cohortId ? { cohortId: params.cohortId } : {}),
        ...userScopeWhere,
      },
      select: {
        id: true,
        username: true,
        studentProfile: {
          select: {
            fullName: true,
            nisn: true,
            class: { select: { name: true } },
            major: { select: { name: true } },
          },
        },
        supervision: {
          select: {
            supervisor: {
              select: { username: true, teacherProfile: { select: { fullName: true } } },
            },
          },
        },
      },
      orderBy: { username: 'asc' },
    });

    // Nilai (prioritas yang sudah punya nilai akhir, lalu terbaru)
    const gradeRows = await gradeRepository.findMany({});
    const gradeByStudent = new Map<string, GradeWithStudent>();
    for (const g of gradeRows) {
      const cur = gradeByStudent.get(g.studentId);
      if (!cur || (cur.finalScore == null && g.finalScore != null)) gradeByStudent.set(g.studentId, g);
    }
    const approvalByGrade = new Map<string, GradeApprovalInfo>();
    if (gradeRows.length > 0) {
      const approvals = await prisma.approval.findMany({
        where: { entityType: ENTITY_GRADE, entityId: { in: gradeRows.map((g) => g.id) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, entityId: true, status: true, actorId: true, note: true, actedAt: true },
      });
      for (const a of approvals) if (!approvalByGrade.has(a.entityId)) approvalByGrade.set(a.entityId, a);
    }

    // Perusahaan tujuan dari pendaftaran aktif (DISETUJUI lebih diprioritaskan)
    const regs = await prisma.registration.findMany({
      where: {
        status: { in: ['DIAJUKAN', 'DISETUJUI'] },
        ...(params?.cohortId ? { cohortId: params.cohortId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { studentId: true, status: true, company: { select: { name: true } } },
    });
    const companyByStudent = new Map<string, string>();
    for (const r of regs) {
      const name = r.company?.name;
      if (!name) continue;
      if (r.status === 'DISETUJUI') companyByStudent.set(r.studentId, name);
      else if (!companyByStudent.has(r.studentId)) companyByStudent.set(r.studentId, name);
    }

    // Fallback nama kelas dari master siswa (NISN unik global)
    const nisns = [...new Set(students.map((s) => s.studentProfile?.nisn).filter((n): n is string => !!n))];
    const registryRows = nisns.length
      ? await prisma.studentRegistry.findMany({
          where: { nisn: { in: nisns } },
          select: { nisn: true, className: true },
        })
      : [];
    const registryClass = new Map(registryRows.map((r) => [r.nisn, r.className]));

    const classMap = new Map<
      string,
      Map<
        string,
        {
          userId: string;
          username: string;
          fullName: string;
          nisn: string | null;
          companyName: string | null;
          supervisorName: string | null;
          approvalStatus: ApprovalStatus | null;
          grade: GradeWithStudent | null;
        }
      >
    >();

    for (const s of students) {
      const p = s.studentProfile;
      const className =
        p?.class?.name ?? (p?.nisn ? registryClass.get(p.nisn) : undefined) ?? 'Belum Ada Kelas';
      let rows = classMap.get(className);
      if (!rows) {
        rows = new Map();
        classMap.set(className, rows);
      }
      const grade = gradeByStudent.get(s.id) ?? null;
      rows.set(s.id, {
        userId: s.id,
        username: s.username,
        fullName: p?.fullName ?? s.username,
        nisn: p?.nisn ?? null,
        companyName: companyByStudent.get(s.id) ?? null,
        supervisorName:
          s.supervision?.supervisor.teacherProfile?.fullName ??
          s.supervision?.supervisor.username ??
          null,
        approvalStatus: grade ? (approvalByGrade.get(grade.id)?.status ?? null) : null,
        grade,
      });
    }

    const classes = [...classMap.entries()]
      .map(([className, rows]) => {
        const studentsOut = [...rows.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
        return {
          className,
          studentCount: studentsOut.length,
          gradedCount: studentsOut.filter((st) => st.grade !== null).length,
          students: studentsOut,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    return {
      classes,
      totalStudents: classes.reduce((s, c) => s + c.studentCount, 0),
      totalGraded: classes.reduce((s, c) => s + c.gradedCount, 0),
    };
  }

  /** Lampirkan status persetujuan terbaru (per grade) ke daftar nilai. */
  private async attachApprovals<T extends { id: string }>(
    items: T[]
  ): Promise<Array<GradeWithApproval<T>>> {
    if (items.length === 0) return [];
    const approvals = await prisma.approval.findMany({
      where: { entityType: ENTITY_GRADE, entityId: { in: items.map((i) => i.id) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, entityId: true, status: true, actorId: true, note: true, actedAt: true },
    });
    const byEntity = new Map<string, GradeApprovalInfo>();
    for (const a of approvals) if (!byEntity.has(a.entityId)) byEntity.set(a.entityId, a);
    return items.map((i) => ({ ...i, approval: byEntity.get(i.id) ?? null }));
  }

  /** Kembalikan status approval ke MENUNGGU saat nilai diinput ulang. */
  private async resetApproval(gradeId: string): Promise<GradeApprovalInfo> {
    const latest = await prisma.approval.findFirst({
      where: { entityType: ENTITY_GRADE, entityId: gradeId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    if (latest && latest.status === 'MENUNGGU') {
      return prisma.approval.findUniqueOrThrow({
        where: { id: latest.id },
        select: { id: true, status: true, actorId: true, note: true, actedAt: true },
      });
    }
    return prisma.approval.create({
      data: { entityType: ENTITY_GRADE, entityId: gradeId, status: 'MENUNGGU' },
      select: { id: true, status: true, actorId: true, note: true, actedAt: true },
    });
  }

  /** Catat keputusan pada approval MENUNGGU terakhir (atau buat baru bila tidak ada). */
  private async decideApproval(
    gradeId: string,
    status: ApprovalStatus,
    actorId: string,
    note: string | null
  ): Promise<GradeApprovalInfo> {
    const latest = await prisma.approval.findFirst({
      where: { entityType: ENTITY_GRADE, entityId: gradeId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    const data = { status, actorId, actedAt: new Date(), note };
    if (latest && latest.status === 'MENUNGGU') {
      return prisma.approval.update({
        where: { id: latest.id },
        data,
        select: { id: true, status: true, actorId: true, note: true, actedAt: true },
      });
    }
    return prisma.approval.create({
      data: { entityType: ENTITY_GRADE, entityId: gradeId, ...data },
      select: { id: true, status: true, actorId: true, note: true, actedAt: true },
    });
  }
}

export const gradeService = new GradeService();
