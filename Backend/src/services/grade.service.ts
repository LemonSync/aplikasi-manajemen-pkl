import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { gradeRepository } from '../repositories/grade.repository';
import { groupRepository } from '../repositories/group.repository';
import { groupService } from './group.service';
import { auditService } from './audit.service';
import { studentWorkflowService } from './studentWorkflow.service';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { CreateGradeDTO, UpdateGuidanceScoreDTO } from '../validators/phase4.validator';

/** Hitung predicate berdasarkan skor (A/B/C/D). */
const calcPredicate = (score: number): string => {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
};

/**
 * Service penilaian PKL (Fase 4).
 */
export class GradeService {
  /** DUDI: input nilai akhir PKL per siswa. */
  async inputGrade(
    actorId: string,
    dto: CreateGradeDTO,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    // Pastikan siswa ada
    const { prisma } = await import('../config/prisma');
    // Fase efektif ditentukan jadwal cohort. Sinkronkan dahulu agar siswa yang
    // belum membuka workflow tetap bisa dinilai saat jadwal sudah Pasca PKL.
    await studentWorkflowService.syncScheduledPhase(dto.studentId);
    const student = await prisma.user.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new NotFoundError('Siswa tidak ditemukan');
    if (student.role !== Role.SISWA) throw new BadRequestError('ID harus merujuk ke siswa');
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor) throw new NotFoundError('Penginput nilai tidak ditemukan');
    if (actor.role === Role.DUDI && student.phase !== 'PKL_SELESAI') {
      throw new BadRequestError('Nilai akhir hanya dapat diinput setelah siswa memasuki fase Pasca PKL');
    }

    // DUDI hanya boleh menilai siswa pada kelompok milik perusahaannya sendiri.
    // Admin tetap dapat membantu input/koreksi administratif melalui endpoint yang sama.
    if (actor.role === Role.DUDI && !dto.groupId) {
      throw new BadRequestError('Kelompok wajib diisi saat DUDI menginput nilai');
    }
    if (dto.groupId) {
      const group = await groupRepository.findByIdWithRelations(dto.groupId);
      if (!group) throw new NotFoundError('Kelompok tidak ditemukan');
      // Validasi siswa anggota kelompok
      const isMember = group.members.some((m) => m.userId === dto.studentId);
      if (!isMember) throw new BadRequestError('Siswa bukan anggota kelompok ini');
      if (actor.role === Role.DUDI) {
        const assignment = await prisma.groupDudiMentor.findUnique({ where: { groupId_dudiUserId: { groupId: dto.groupId, dudiUserId: actorId } } });
        if (!assignment?.isPrimary) {
          throw new BadRequestError('Hanya DUDI utama yang ditugaskan pada kelompok ini dapat menginput nilai akhir');
        }
      }
    }

    const aspects = dto.aspects ?? [];
    let finalScore: number;
    if (dto.scoreDudi !== undefined) {
      finalScore = dto.scoreDudi;
    } else if (aspects.length > 0) {
      // Nilai akhir = rata-rata indikator yang diisi DUDI
      finalScore =
        Math.round((aspects.reduce((sum, a) => sum + a.score, 0) / aspects.length) * 100) / 100;
    } else {
      throw new BadRequestError('Isi nilai DUDI atau daftar indikator penilaian');
    }
    const predicate = calcPredicate(finalScore);

    const grade = await gradeRepository.upsertByStudentAndGiver(
      dto.studentId,
      Role.DUDI,
      {
        student: { connect: { id: dto.studentId } },
        giver: { connect: { id: actorId } },
        giverRole: Role.DUDI,
        scoreDudi: finalScore,
        finalScore,
        predicate,
        note: dto.note ?? null,
        ...(dto.groupId ? { groupId: dto.groupId } : {}),
      },
      {
        scoreDudi: finalScore,
        finalScore,
        predicate,
        note: dto.note ?? null,
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

    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GRADE,
      entityType: ENTITY_TYPES.USER,
      entityId: dto.studentId,
      metadata: { scoreDudi: finalScore, finalScore, predicate, aspects: aspects.map((a) => a.label) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return grade;
  }

  /** Guru: input nilai bimbingan (catatan). */
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
    // Guru pembimbing hanya boleh menilai kelompok bimbingannya sendiri.
    if (actor.role === Role.GURU_PEMBIMBING) {
      if (!grade.groupId) throw new BadRequestError(MESSAGES.SCOPE);
      await groupService.assertSupervisor(actorId, grade.groupId);
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

  /** Siswa: lihat rekap nilai sendiri. */
  async getMyGrades(studentId: string) {
    return gradeRepository.findMany({ studentId });
  }

  /** Daftar siswa yang benar-benar diawasi DUDI, dikelompokkan per kelompok PKL. */
  async getDudiAssignments(dudiUserId: string) {
    const { prisma } = await import('../config/prisma');
    return prisma.group.findMany({
      where: { dudiMentors: { some: { dudiUserId } }, deletedAt: null, status: { not: 'DIBUBARKAN' } },
      select: {
        id: true, name: true,
        members: { where: { user: { role: Role.SISWA } }, select: { user: { select: { id: true, username: true, studentProfile: { select: { fullName: true } } } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** DUDI: rekap nilai siswa pada kelompok yang diawasinya. */
  async getDudiGrades(dudiUserId: string) {
    const { prisma } = await import('../config/prisma');
    const groups = await prisma.group.findMany({
      where: { dudiMentors: { some: { dudiUserId } }, deletedAt: null, status: { not: 'DIBUBARKAN' } },
      select: { id: true },
    });
    if (groups.length === 0) return [];
    return gradeRepository.findMany({ groupId: { in: groups.map((g) => g.id) } });
  }

  /** Admin/Guru: lihat nilai per kelompok. Guru dibatasi ke kelompok bimbingannya. */
  async list(
    params: { page: number; perPage: number; groupId?: string; studentId?: string },
    actor: { id: string; role: string }
  ) {
    if (actor.role === Role.GURU_PEMBIMBING) {
      const supervised = await prisma.groupSupervisor.findMany({
        where: { userId: actor.id },
        select: { groupId: true },
      });
      const ids = supervised.map((s) => s.groupId);
      if (params.groupId) {
        if (!ids.includes(params.groupId)) throw new BadRequestError(MESSAGES.SCOPE);
      } else if (ids.length === 0) {
        return { items: [], total: 0 };
      }
      const where = {
        groupId: params.groupId ? params.groupId : { in: ids },
        ...(params.studentId ? { studentId: params.studentId } : {}),
      };
      return gradeRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
    }

    const where = {
      ...(params.groupId ? { groupId: params.groupId } : {}),
      ...(params.studentId ? { studentId: params.studentId } : {}),
    };
    return gradeRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Admin: rekap semua nilai. */
  async getRecap(params?: { groupId?: string }) {
    const where = params?.groupId ? { groupId: params.groupId } : {};
    return gradeRepository.findMany(where);
  }

  /**
   * Admin: rekap penilaian per kelas → kelompok → siswa.
   * Sumber siswa = seluruh anggota kelompok PKL aktif, termasuk yang belum
   * dinilai (`grade: null`), agar admin bisa melihat siapa yang belum dinilai.
   * Kelas boleh campur dalam satu kelompok; `memberCount` dipakai UI untuk
   * penanda "n dari m anggota di kelas ini".
   */
  async getRecapByClass(params?: { cohortId?: string }): Promise<{
    classes: Array<{
      className: string;
      studentCount: number;
      gradedCount: number;
      groups: Array<{
        groupId: string | null;
        groupName: string;
        companyName: string | null;
        memberCount: number;
        students: Array<{
          userId: string;
          username: string;
          fullName: string;
          nisn: string | null;
          grade: Awaited<ReturnType<typeof gradeRepository.findMany>>[number] | null;
        }>;
      }>;
    }>;
    totalStudents: number;
    totalGraded: number;
  }> {
    const members = await prisma.groupMember.findMany({
      where: {
        group: { deletedAt: null },
        user: { deletedAt: null, role: Role.SISWA, ...(params?.cohortId ? { cohortId: params.cohortId } : {}) },
      },
      include: {
        group: { include: { company: { select: { name: true } } } },
        user: {
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
          },
        },
      },
    });

    // Satu nilai terbaik per siswa: prioritas yang sudah punya nilai akhir,
    // lalu yang terbaru (daftar repo sudah urut createdAt desc).
    const gradeRows = await gradeRepository.findMany({});
    const gradeByStudent = new Map<string, (typeof gradeRows)[number]>();
    for (const g of gradeRows) {
      const cur = gradeByStudent.get(g.studentId);
      if (!cur || (cur.finalScore == null && g.finalScore != null)) gradeByStudent.set(g.studentId, g);
    }

    // Fallback nama kelas dari master siswa (NISN unik global)
    const nisns = [...new Set(members.map((m) => m.user.studentProfile?.nisn).filter((n): n is string => !!n))];
    const registryRows = nisns.length
      ? await prisma.studentRegistry.findMany({ where: { nisn: { in: nisns } }, select: { nisn: true, className: true } })
      : [];
    const registryClass = new Map(registryRows.map((r) => [r.nisn, r.className]));

    const memberCountByGroup = new Map<string, number>();
    for (const m of members) memberCountByGroup.set(m.groupId, (memberCountByGroup.get(m.groupId) ?? 0) + 1);

    type StudentOut = {
      userId: string;
      username: string;
      fullName: string;
      nisn: string | null;
      grade: (typeof gradeRows)[number] | null;
    };
    const classMap = new Map<
      string,
      Map<string, { groupId: string; groupName: string; companyName: string | null; students: Map<string, StudentOut> }>
    >();

    for (const m of members) {
      const p = m.user.studentProfile;
      const className = p?.class?.name ?? (p?.nisn ? registryClass.get(p.nisn) : undefined) ?? 'Belum Ada Kelas';

      let groups = classMap.get(className);
      if (!groups) {
        groups = new Map();
        classMap.set(className, groups);
      }
      let grp = groups.get(m.groupId);
      if (!grp) {
        grp = {
          groupId: m.groupId,
          groupName: m.group.name,
          companyName: m.group.company?.name ?? null,
          students: new Map(),
        };
        groups.set(m.groupId, grp);
      }
      if (!grp.students.has(m.user.id)) {
        grp.students.set(m.user.id, {
          userId: m.user.id,
          username: m.user.username,
          fullName: p?.fullName ?? m.user.username,
          nisn: p?.nisn ?? null,
          grade: gradeByStudent.get(m.user.id) ?? null,
        });
      }
    }

    const classes = [...classMap.entries()]
      .map(([className, groups]) => {
        const groupsOut = [...groups.values()]
          .map((g) => ({
            groupId: g.groupId,
            groupName: g.groupName,
            companyName: g.companyName,
            memberCount: memberCountByGroup.get(g.groupId) ?? g.students.size,
            students: [...g.students.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)),
          }))
          .sort((a, b) => a.groupName.localeCompare(b.groupName));
        const studentCount = groupsOut.reduce((s, g) => s + g.students.length, 0);
        const gradedCount = groupsOut.reduce((s, g) => s + g.students.filter((st) => st.grade !== null).length, 0);
        return { className, studentCount, gradedCount, groups: groupsOut };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    return {
      classes,
      totalStudents: classes.reduce((s, c) => s + c.studentCount, 0),
      totalGraded: classes.reduce((s, c) => s + c.gradedCount, 0),
    };
  }
}

export const gradeService = new GradeService();
