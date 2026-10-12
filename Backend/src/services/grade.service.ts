import { ApprovalStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { gradeRepository, GradeWithStudent } from '../repositories/grade.repository';
import { auditService } from './audit.service';
import { notificationService } from './notification.service';
import { studentWorkflowService } from './studentWorkflow.service';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { ApproveGradeDTO, CreateGradeDTO, UpdateGuidanceScoreDTO } from '../validators/phase4.validator';

/** Hitung predicate berdasarkan skor (A/B/C/D). */
const calcPredicate = (score: number): string => {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
};

const ENTITY_GRADE = 'GRADE';

export type GradeApprovalInfo = {
  id: string;
  status: ApprovalStatus;
  actorId: string | null;
  note: string | null;
  actedAt: Date | null;
};

type GradeWithApproval<T extends { id: string }> = T & { approval: GradeApprovalInfo | null };

/**
 * Service penilaian PKL (Fase 4).
 *
 * Alur per-orang: siswa menginput nilai DUDI sendiri pada fase Pasca PKL,
 * guru pembimbing yang menaungi siswa tersebut menyetujui/menolak, lalu
 * guru mengisi nilai bimbingan sebagai catatan.
 */
export class GradeService {
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
        studentProfile: { select: { fullName: true } },
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

    const aspects = dto.aspects ?? [];
    let finalScore: number;
    if (dto.scoreDudi !== undefined) {
      finalScore = dto.scoreDudi;
    } else if (aspects.length > 0) {
      finalScore =
        Math.round((aspects.reduce((sum, a) => sum + a.score, 0) / aspects.length) * 100) / 100;
    } else {
      throw new BadRequestError('Isi nilai DUDI atau daftar indikator penilaian');
    }
    const predicate = calcPredicate(finalScore);

    const grade = await gradeRepository.upsertByStudentAndGiver(
      studentId,
      Role.DUDI,
      {
        student: { connect: { id: studentId } },
        giver: { connect: { id: actorId } },
        giverRole: Role.DUDI,
        scoreDudi: finalScore,
        finalScore,
        predicate,
        note: dto.note ?? null,
      },
      {
        scoreDudi: finalScore,
        finalScore,
        predicate,
        note: dto.note ?? null,
        giver: { connect: { id: actorId } },
      }
    );

    // Simpan rincian aspek/indikator (ganti totalitas bila ada input baru)
    if (aspects.length > 0) {
      await prisma.$transaction([
        prisma.gradeAspect.deleteMany({ where: { gradeId: grade.id } }),
        prisma.gradeAspect.createMany({
          data: aspects.map((a) => ({ gradeId: grade.id, label: a.label, score: a.score })),
        }),
      ]);
    }

    // Input baru = menunggu persetujuan guru pembimbing lagi.
    await this.resetApproval(grade.id);

    // Kabari guru pembimbing yang menaungi siswa ini.
    const supervision = await prisma.studentSupervisor.findUnique({
      where: { studentId: studentId },
      select: { supervisorId: true },
    });
    if (supervision?.supervisorId && supervision.supervisorId !== actorId) {
      const studentName = student.studentProfile?.fullName ?? 'Seorang siswa';
      await notificationService.create(
        supervision.supervisorId,
        'Nilai PKL menunggu persetujuan',
        `${studentName} menginput nilai PKL. Mohon tinjau di halaman Penilaian.`,
        'GRADE',
        '/guru/penilaian'
      );
    }

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GRADE,
      entityType: ENTITY_TYPES.USER,
      entityId: studentId,
      metadata: { scoreDudi: finalScore, finalScore, predicate, aspects: aspects.map((a) => a.label) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return grade;
  }

  /** Guru: setujui/tolak nilai yang diinput siswa. */
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

    if (actor.role === Role.GURU_PEMBIMBING) {
      const supervision = await prisma.studentSupervisor.findUnique({
        where: { studentId: grade.studentId },
        select: { supervisorId: true },
      });
      if (supervision?.supervisorId !== actorId) throw new BadRequestError(MESSAGES.SCOPE);
    }

    const status: ApprovalStatus = dto.approved ? 'DISETUJUI' : 'DITOLAK';
    const approval = await this.decideApproval(grade.id, status, actorId, dto.note ?? null);

    const studentName = grade.student.studentProfile?.fullName ?? 'Siswa';
    await notificationService.create(
      grade.studentId,
      dto.approved ? 'Nilai PKL disetujui' : 'Nilai PKL ditolak',
      dto.approved
        ? `Nilai PKL Anda disetujui oleh guru pembimbing.`
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

  /** Guru: input nilai bimbingan (catatan) untuk siswa bimbingannya. */
  async inputGuidanceScore(
    actorId: string,
    gradeId: string,
    dto: UpdateGuidanceScoreDTO,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    const grade = await gradeRepository.findById(gradeId);
    if (!grade) throw new NotFoundError(MESSAGES.NOT_FOUND);

    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor) throw new NotFoundError('Penginput nilai tidak ditemukan');
    if (actor.role === Role.GURU_PEMBIMBING) {
      const supervision = await prisma.studentSupervisor.findUnique({
        where: { studentId: grade.studentId },
        select: { supervisorId: true },
      });
      if (supervision?.supervisorId !== actorId) throw new BadRequestError(MESSAGES.SCOPE);
    }

    const updated = await gradeRepository.update(gradeId, {
      scoreGuidance: dto.scoreGuidance,
      note: dto.note ?? grade.note,
    });

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GRADE,
      entityType: ENTITY_TYPES.USER,
      entityId: grade.studentId,
      metadata: { scoreGuidance: dto.scoreGuidance, gradeId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  /** Siswa: lihat rekap nilai sendiri (termasuk status persetujuan). */
  async getMyGrades(studentId: string): Promise<Array<GradeWithApproval<GradeWithStudent>>> {
    const items = await gradeRepository.findMany({ studentId });
    return this.attachApprovals(items);
  }

  /** Admin/Guru: daftar nilai. Guru dibatasi ke siswa bimbingannya. */
  async list(
    params: { page: number; perPage: number; studentId?: string },
    actor: { id: string; role: string }
  ): Promise<{ items: Array<GradeWithApproval<GradeWithStudent>>; total: number }> {
    let where: Prisma.GradeWhereInput = {
      ...(params.studentId ? { studentId: params.studentId } : {}),
    };

    if (actor.role === Role.GURU_PEMBIMBING) {
      if (params.studentId) {
        const supervision = await prisma.studentSupervisor.findUnique({
          where: { studentId: params.studentId },
          select: { supervisorId: true },
        });
        if (supervision?.supervisorId !== actor.id) throw new BadRequestError(MESSAGES.SCOPE);
      } else {
        const links = await prisma.studentSupervisor.findMany({
          where: { supervisorId: actor.id },
          select: { studentId: true },
        });
        if (links.length === 0) return { items: [], total: 0 };
        where = { ...where, studentId: { in: links.map((l) => l.studentId) } };
      }
    }

    const { items, total } = await gradeRepository.paginate(
      where,
      (params.page - 1) * params.perPage,
      params.perPage
    );
    return { items: await this.attachApprovals(items), total };
  }

  /** Admin: rekap semua nilai. */
  async getRecap(): Promise<Array<GradeWithApproval<GradeWithStudent>>> {
    const items = await gradeRepository.findMany({});
    return this.attachApprovals(items);
  }

  /**
   * Admin: rekap penilaian per kelas → siswa.
   * Sumber = seluruh siswa aktif cohort, termasuk yang belum dinilai (`grade: null`),
   * lengkap dengan perusahaan tujuan dan guru pembimbing.
   */
  async getRecapByClass(params?: { cohortId?: string }): Promise<{
    classes: Array<{
      className: string;
      studentCount: number;
      gradedCount: number;
      students: Array<{
        userId: string;
        username: string;
        fullName: string;
        nisn: string | null;
        companyName: string | null;
        supervisorName: string | null;
        approvalStatus: ApprovalStatus | null;
        grade: GradeWithStudent | null;
      }>;
    }>;
    totalStudents: number;
    totalGraded: number;
  }> {
    const students = await prisma.user.findMany({
      where: {
        role: Role.SISWA,
        deletedAt: null,
        ...(params?.cohortId ? { cohortId: params.cohortId } : {}),
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
