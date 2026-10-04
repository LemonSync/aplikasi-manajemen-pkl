import { Journal, Prisma } from '@prisma/client';
import { journalRepository } from '../repositories/journal.repository';
import { prisma } from '../config/prisma';
import { groupRepository } from '../repositories/group.repository';
import { auditService } from './audit.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { startOfToday, toDateOnly } from '../utils/date';

export interface SaveJournalInput {
  date?: string; // YYYY-MM-DD; default hari ini
  activity: string;
  result?: string | null;
  obstacles?: string | null;
}

/**
 * Service jurnal kegiatan (Fase 3).
 * Aturan:
 *  - Siswa hanya boleh mengisi jurnal untuk HARI INI (tidak bisa mengisi tanggal lampau) — kecuali
 *    pembimbing yang dapat memberi catatan pada jurnal yang sudah ada.
 *  - Satu jurnal per siswa per hari (dicek manual).
 */
export class JournalService {
  private async requireActiveGroup(userId: string) {
    const group = await groupRepository.findActiveByMember(userId);
    if (!group) throw new BadRequestError(MESSAGES.ATTENDANCE.NO_GROUP);
    return group;
  }

  private resolveDate(inputDate?: string): Date {
    if (!inputDate) return startOfToday();
    const today = toDateOnly();
    if (inputDate > today) {
      throw new BadRequestError(MESSAGES.JOURNAL.BACKFILL_FORBIDDEN);
    }
    if (inputDate !== today) {
      // Hanya boleh mengisi untuk hari ini.
      throw new BadRequestError(MESSAGES.JOURNAL.BACKFILL_FORBIDDEN);
    }
    return startOfToday();
  }

  /** Membuat jurnal baru milik siswa. */
  async create(userId: string, input: SaveJournalInput, ctx: { ipAddress?: string; userAgent?: string }): Promise<Journal> {
    const group = await this.requireActiveGroup(userId);
    const date = this.resolveDate(input.date);

    const existing = await journalRepository.findByUserAndDate(userId, date);
    if (existing) throw new ConflictError(MESSAGES.JOURNAL.DUPLICATE);

    const journal = await journalRepository.create({
      user: { connect: { id: userId } },
      group: { connect: { id: group.id } },
      date,
      activity: input.activity,
      result: input.result ?? null,
      obstacles: input.obstacles ?? null,
    });

    await auditService.record({
      actorId: userId,
      action: AUDIT_ACTIONS.CREATE_JOURNAL,
      entityType: ENTITY_TYPES.JOURNAL,
      entityId: journal.id,
      metadata: { date: toDateOnly(date) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return journal;
  }

  private async getOwned(userId: string, id: string): Promise<Journal> {
    const journal = await journalRepository.findById(id);
    if (!journal) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (journal.userId !== userId) throw new ForbiddenError(MESSAGES.SCOPE);
    return journal;
  }

  /** Memperbarui jurnal milik siswa (hanya hari ini). */
  async update(
    userId: string,
    id: string,
    input: Partial<SaveJournalInput>
  ): Promise<Journal> {
    const journal = await this.getOwned(userId, id);
    if (toDateOnly(journal.date) !== toDateOnly()) {
      throw new BadRequestError('Jurnal hanya dapat diubah pada hari yang sama');
    }
    return journalRepository.update(id, {
      ...(input.activity !== undefined ? { activity: input.activity } : {}),
      ...(input.result !== undefined ? { result: input.result ?? null } : {}),
      ...(input.obstacles !== undefined ? { obstacles: input.obstacles ?? null } : {}),
    });
  }

  /** Daftar jurnal milik siswa. */
  async myJournals(userId: string, params: { page: number; perPage: number }) {
    return journalRepository.paginate({ userId }, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Daftar jurnal (guru/admin) dengan filter. */
  async list(
    params: { page: number; perPage: number; groupId?: string; userId?: string },
    actor?: { id: string; role: string }
  ) {
    const where: Prisma.JournalWhereInput = {
      ...(params.groupId ? { groupId: params.groupId } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
    };

    // Guru pembimbing hanya melihat jurnal kelompok bimbingannya
    if (actor && actor.role === 'GURU_PEMBIMBING') {
      const supervised = await prisma.groupSupervisor.findMany({
        where: { userId: actor.id },
        select: { groupId: true },
      });
      const ids = supervised.map((s) => s.groupId);
      if (params.groupId) {
        if (!ids.includes(params.groupId)) throw new ForbiddenError(MESSAGES.SCOPE);
      } else if (ids.length === 0) {
        return { items: [], total: 0 };
      } else {
        where.groupId = { in: ids };
      }
    }

    return journalRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Pembimbing memberi catatan pada jurnal siswa. */
  async addSupervisorNote(actorId: string, id: string, note: string): Promise<Journal> {
    const journal = await journalRepository.findById(id);
    if (!journal) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (journal.groupId) {
      const rel = await groupRepository.findByIdWithRelations(journal.groupId);
      const isSupervisor = rel?.supervisors.some((s) => s.userId === actorId) ?? false;
      if (!isSupervisor) throw new ForbiddenError(MESSAGES.VISIT.NOT_SUPERVISOR);
    }
    const updated = await journalRepository.update(id, { supervisorNote: note });
    await auditService.record({
      actorId,
      action: AUDIT_ACTIONS.UPDATE_GROUP,
      entityType: ENTITY_TYPES.JOURNAL,
      entityId: id,
      metadata: { supervisorNote: true },
    });
    return updated;
  }

  /** DUDI mengesahkan jurnal siswa yang ditempatkan pada perusahaannya. */
  async verifyByDudi(actorId: string, id: string, note?: string): Promise<Journal> {
    const journal = await journalRepository.findById(id);
    if (!journal) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (!journal.groupId) throw new BadRequestError('Jurnal belum terhubung ke kelompok PKL');
    if (journal.dudiVerifiedById) throw new ConflictError('Jurnal sudah dikonfirmasi DUDI');

    const assignment = await prisma.groupDudiMentor.findUnique({ where: { groupId_dudiUserId: { groupId: journal.groupId, dudiUserId: actorId } } });
    if (!assignment) throw new ForbiddenError(MESSAGES.SCOPE);

    return journalRepository.update(id, {
      dudiVerifiedBy: { connect: { id: actorId } },
      dudiVerifiedAt: new Date(),
      dudiVerificationNote: note ?? null,
    });
  }

  /** Jurnal pada kelompok perusahaan DUDI yang sedang login. */
  async listForDudi(actorId: string, params: { page: number; perPage: number; groupId?: string }) {
    const groups = await prisma.groupDudiMentor.findMany({ where: { dudiUserId: actorId }, select: { groupId: true } });
    const groupIds = groups.map((group) => group.groupId);

    // Filter groupId harus termasuk kelompok yang diawasi (anti-bypass)
    if (params.groupId && !groupIds.includes(params.groupId)) {
      throw new ForbiddenError(MESSAGES.SCOPE);
    }

    return journalRepository.paginate(
      { groupId: params.groupId ? params.groupId : { in: groupIds.length ? groupIds : ['__none__'] } },
      (params.page - 1) * params.perPage,
      params.perPage,
    );
  }
}

export const journalService = new JournalService();
