import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { visitRepository } from '../repositories/visit.repository';
import { groupRepository } from '../repositories/group.repository';
import { auditService } from './audit.service';
import { ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';

export interface CreateVisitInput {
  groupId?: string | null;
  companyId?: string | null;
  scheduledAt: string;
  note?: string | null;
}

/**
 * Service kunjungan/monitoring guru pembimbing (Fase 3).
 * Guru hanya boleh menjadwalkan kunjungan untuk kelompok yang dibimbingnya.
 */
export class VisitService {
  async create(
    supervisorId: string,
    input: CreateVisitInput,
    ctx: { ipAddress?: string; userAgent?: string }
  ) {
    // Bila menargetkan group, pastikan guru adalah pembimbingnya.
    if (input.groupId) {
      const group = await groupRepository.findByIdWithRelations(input.groupId);
      if (!group) throw new NotFoundError('Kelompok tidak ditemukan');
      const isSupervisor = group.supervisors.some((s) => s.userId === supervisorId);
      if (!isSupervisor) throw new ForbiddenError(MESSAGES.VISIT.NOT_SUPERVISOR);
    }

    const visit = await visitRepository.create({
      supervisor: { connect: { id: supervisorId } },
      ...(input.groupId ? { group: { connect: { id: input.groupId } } } : {}),
      ...(input.companyId ? { company: { connect: { id: input.companyId } } } : {}),
      scheduledAt: new Date(input.scheduledAt),
      note: input.note ?? null,
    });

    await auditService.record({
      actorId: supervisorId,
      action: AUDIT_ACTIONS.CREATE_VISIT,
      entityType: ENTITY_TYPES.VISIT,
      entityId: visit.id,
      metadata: { groupId: input.groupId ?? null },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // sendMonitoring: umumkan jadwal monitoring ke semua anggota kelompok
    if (input.groupId) {
      const members = await prisma.groupMember.findMany({
        where: { groupId: input.groupId },
        select: { userId: true },
      });
      const when = new Date(input.scheduledAt).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      await prisma.notification.createMany({
        data: members.map((m) => ({
          userId: m.userId,
          title: 'Jadwal Monitoring PKL',
          body: `Guru pembimbing menjadwalkan monitoring pada ${when}.${input.note ? ' Catatan: ' + input.note : ''}`,
          type: 'VISIT_SCHEDULE',
          link: '/pengaduan',
        })),
      });
    }

    return visitRepository.findById(visit.id);
  }

  /** Tandai kunjungan telah dilakukan + catatan hasil. */
  async markVisited(supervisorId: string, id: string, note?: string, role?: string) {
    const visit = await visitRepository.findById(id);
    if (!visit) throw new NotFoundError(MESSAGES.NOT_FOUND);
    // Admin boleh menutup kunjungan siapa pun; guru hanya kunjungannya sendiri.
    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    if (!isAdmin && visit.supervisorId !== supervisorId) throw new ForbiddenError(MESSAGES.SCOPE);

    return visitRepository.update(id, {
      visitedAt: new Date(),
      ...(note !== undefined ? { note: note ?? null } : {}),
    });
  }

  /** Kunjungan milik guru. */
  async myVisits(supervisorId: string, params: { page: number; perPage: number }) {
    return visitRepository.paginate(
      { supervisorId },
      (params.page - 1) * params.perPage,
      params.perPage
    );
  }

  /** Daftar kunjungan (admin) dengan filter; guru: hanya kunjungan miliknya sendiri. */
  async list(
    params: { page: number; perPage: number; groupId?: string; supervisorId?: string },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.VisitWhereInput = {
      ...(params.groupId ? { groupId: params.groupId } : {}),
      ...(params.supervisorId ? { supervisorId: params.supervisorId } : {}),
    };
    if (actor && actor.role === 'GURU_PEMBIMBING') {
      where.supervisorId = actor.id;
    }
    return visitRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }
}

export const visitService = new VisitService();
