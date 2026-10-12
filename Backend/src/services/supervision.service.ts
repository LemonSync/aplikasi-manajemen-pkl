import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditService } from './audit.service';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { registryClassByNisn } from './classResolver.service';

export interface SupervisionRow {
  studentId: string;
  username: string;
  fullName: string | null;
  nisn: string | null;
  className: string | null;
  majorName: string | null;
  phase: string | null;
  cohortId: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  assignedAt: Date | null;
}

/**
 * Service pembimbingan per siswa (1 siswa = 1 guru pembimbing).
 * Admin menugaskan manual (bisa batch); guru melihat daftar bimbingannya.
 */
export class SupervisionService {
  /** Admin: tugaskan/transfer guru pembimbing untuk sekumpulan siswa. */
  async assign(params: {
    studentIds: string[];
    supervisorId: string;
    actorId: string;
    ctx: { ipAddress?: string; userAgent?: string };
  }) {
    const { studentIds, supervisorId, actorId, ctx } = params;

    const supervisor = await prisma.user.findFirst({
      where: { id: supervisorId, role: Role.GURU_PEMBIMBING, isActive: true, deletedAt: null },
      select: { id: true, username: true, teacherProfile: { select: { fullName: true } } },
    });
    if (!supervisor) {
      throw new NotFoundError('Guru pembimbing tidak ditemukan atau tidak aktif');
    }

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds }, role: Role.SISWA, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (students.length !== studentIds.length) {
      const found = new Set(students.map((s) => s.id));
      const missing = studentIds.filter((id) => !found.has(id));
      throw new BadRequestError(`Siswa tidak ditemukan atau tidak aktif: ${missing.join(', ')}`);
    }

    let replaced = 0;
    for (const student of students) {
      const existing = await prisma.studentSupervisor.findUnique({
        where: { studentId: student.id },
        select: { supervisorId: true },
      });
      if (existing) replaced += 1;

      await prisma.studentSupervisor.upsert({
        where: { studentId: student.id },
        update: { supervisorId, assignedById: actorId, assignedAt: new Date() },
        create: { studentId: student.id, supervisorId, assignedById: actorId },
      });

      await auditService.record({
        actorId,
        action: AUDIT_ACTIONS.ASSIGN_SUPERVISOR,
        entityType: ENTITY_TYPES.SUPERVISION,
        entityId: student.id,
        metadata: { supervisorId, previousSupervisorId: existing?.supervisorId ?? null },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }

    return { assigned: students.length, replaced, supervisorName: supervisor.teacherProfile?.fullName ?? supervisor.username };
  }

  /** Admin: lepas pembimbingan seorang siswa. */
  async unassign(studentId: string, actorId: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const link = await prisma.studentSupervisor.findUnique({
      where: { studentId },
      select: { supervisorId: true },
    });
    if (!link) throw new NotFoundError(MESSAGES.NOT_FOUND);

    await prisma.studentSupervisor.delete({ where: { studentId } });
    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UNASSIGN_SUPERVISOR,
      entityType: ENTITY_TYPES.SUPERVISION,
      entityId: studentId,
      metadata: { previousSupervisorId: link.supervisorId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { studentId };
  }

  /** Daftar siswa + pembimbingnya. Guru dipaksa melihat bimbingannya sendiri. */
  async list(params: {
    page: number;
    perPage: number;
    search?: string;
    cohortId?: string;
    supervisorId?: string;
    unassignedOnly?: boolean;
    supervisorSelf?: string;
  }) {
    const supervisorId = params.supervisorSelf ?? params.supervisorId;
    const unassignedOnly = !supervisorId && params.unassignedOnly;

    const where: Prisma.UserWhereInput = {
      role: Role.SISWA,
      isActive: true,
      deletedAt: null,
      ...(params.cohortId ? { cohortId: params.cohortId } : {}),
      ...(supervisorId ? { supervision: { is: { supervisorId } } } : {}),
      ...(unassignedOnly ? { supervision: { is: null } } : {}),
      ...(params.search
        ? {
            OR: [
              { username: { contains: params.search } },
              { studentProfile: { is: { fullName: { contains: params.search } } } },
              { studentProfile: { is: { nisn: { contains: params.search } } } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.perPage;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          username: true,
          phase: true,
          cohortId: true,
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
              assignedAt: true,
              supervisor: {
                select: {
                  id: true,
                  username: true,
                  teacherProfile: { select: { fullName: true } },
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Kelas: preferensi Class.name, fallback ke Master Siswa (NISN).
    const registryClass = await registryClassByNisn(users.map((u) => u.studentProfile?.nisn));

    const items: SupervisionRow[] = users.map((u) => ({
      studentId: u.id,
      username: u.username,
      fullName: u.studentProfile?.fullName ?? null,
      nisn: u.studentProfile?.nisn ?? null,
      className:
        u.studentProfile?.class?.name ??
        (u.studentProfile?.nisn ? registryClass.get(u.studentProfile.nisn) ?? null : null),
      majorName: u.studentProfile?.major?.name ?? null,
      phase: u.phase,
      cohortId: u.cohortId,
      supervisorId: u.supervision?.supervisor?.id ?? null,
      supervisorName:
        u.supervision?.supervisor?.teacherProfile?.fullName ??
        u.supervision?.supervisor?.username ??
        null,
      assignedAt: u.supervision?.assignedAt ?? null,
    }));

    return { items, total };
  }

  /** Pembimbing seorang siswa (untuk halaman siswa). */
  async getForStudent(studentId: string) {
    const link = await prisma.studentSupervisor.findUnique({
      where: { studentId },
      select: {
        assignedAt: true,
        supervisor: {
          select: {
            id: true,
            username: true,
            teacherProfile: { select: { fullName: true, nip: true, phone: true } },
          },
        },
      },
    });
    if (!link) return null;
    return {
      supervisorId: link.supervisor.id,
      supervisorName: link.supervisor.teacherProfile?.fullName ?? link.supervisor.username,
      nip: link.supervisor.teacherProfile?.nip ?? null,
      phone: link.supervisor.teacherProfile?.phone ?? null,
      assignedAt: link.assignedAt,
    };
  }
}

export const supervisionService = new SupervisionService();
