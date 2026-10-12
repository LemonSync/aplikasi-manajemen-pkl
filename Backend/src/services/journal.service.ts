import { Journal, Prisma, Role } from '@prisma/client';
import { journalRepository } from '../repositories/journal.repository';
import { prisma } from '../config/prisma';
import { auditService } from './audit.service';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/AppError';
import { AUDIT_ACTIONS, ENTITY_TYPES, MESSAGES } from '../config/constants';
import { startOfToday, toDateOnly } from '../utils/date';

export interface SaveJournalInput {
  date?: string; // YYYY-MM-DD; default hari ini
  activity: string;
  result?: string | null;
  obstacles?: string | null;
}

/** Aktor request (id + role) untuk keputusan scope. */
export type JournalActor = { id: string; role: string };

/**
 * Service jurnal kegiatan (Fase 3) — sistem per-orang (tanpa kelompok PKL).
 * Aturan:
 *  - Siswa hanya boleh mengisi jurnal untuk HARI INI (tidak bisa mengisi tanggal lampau).
 *  - Satu jurnal per siswa per hari (dicek manual).
 *  - Guru pembimbing hanya menjangkau jurnal milik siswa bimbingannya (StudentSupervisor).
 */
export class JournalService {
  /** Siswa wajib sudah punya guru pembimbing sebelum mengisi jurnal. */
  private async requireSupervisor(userId: string) {
    const link = await prisma.studentSupervisor.findUnique({
      where: { studentId: userId },
      select: { supervisorId: true },
    });
    if (!link) {
      throw new BadRequestError('Anda belum memiliki guru pembimbing. Hubungi administrator');
    }
    return link;
  }

  /** Cek satu siswa termasuk bimbingan aktor (dipakai guru pembimbing). */
  private async assertSupervisedBy(studentId: string, supervisorId: string) {
    const link = await prisma.studentSupervisor.findUnique({
      where: { studentId },
      select: { supervisorId: true },
    });
    if (link?.supervisorId !== supervisorId) throw new BadRequestError(MESSAGES.SCOPE);
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
    await this.requireSupervisor(userId);
    const date = this.resolveDate(input.date);

    const existing = await journalRepository.findByUserAndDate(userId, date);
    if (existing) throw new ConflictError(MESSAGES.JOURNAL.DUPLICATE);

    const journal = await journalRepository.create({
      user: { connect: { id: userId } },
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
    if (journal.userId !== userId) throw new BadRequestError(MESSAGES.SCOPE);
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
    params: { page: number; perPage: number; userId?: string },
    actor?: JournalActor
  ) {
    const where: Prisma.JournalWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
    };

    // Guru pembimbing hanya melihat jurnal siswa bimbingannya
    if (actor && actor.role === Role.GURU_PEMBIMBING) {
      if (params.userId) {
        // Filter userId harus termasuk siswa bimbingan (anti-bypass)
        await this.assertSupervisedBy(params.userId, actor.id);
      } else {
        const links = await prisma.studentSupervisor.findMany({
          where: { supervisorId: actor.id },
          select: { studentId: true },
        });
        const supervisedIds = links.map((l) => l.studentId);
        if (supervisedIds.length === 0) return { items: [], total: 0 };
        where.userId = { in: supervisedIds };
      }
    }

    return journalRepository.paginate(where, (params.page - 1) * params.perPage, params.perPage);
  }

  /** Pembimbing memberi catatan pada jurnal siswa bimbingannya. */
  async addSupervisorNote(actor: JournalActor, id: string, note: string): Promise<Journal> {
    const journal = await journalRepository.findById(id);
    if (!journal) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (actor.role === Role.GURU_PEMBIMBING) {
      await this.assertSupervisedBy(journal.userId, actor.id);
    }
    return journalRepository.update(id, { supervisorNote: note });
  }

  /** Guru pembimbing (atau admin) mengesahkan jurnal milik siswa bimbingannya. */
  async verify(actor: JournalActor, id: string, note?: string): Promise<Journal> {
    const journal = await journalRepository.findById(id);
    if (!journal) throw new NotFoundError(MESSAGES.NOT_FOUND);
    if (journal.verifiedById) throw new ConflictError('Jurnal sudah dikonfirmasi');

    if (actor.role === Role.GURU_PEMBIMBING) {
      await this.assertSupervisedBy(journal.userId, actor.id);
    }

    const updated = await journalRepository.update(id, {
      verifiedBy: { connect: { id: actor.id } },
      verifiedAt: new Date(),
      verificationNote: note ?? null,
    });

    await auditService.record({
      actorId: actor.id,
      action: AUDIT_ACTIONS.APPROVE,
      entityType: ENTITY_TYPES.JOURNAL,
      entityId: id,
      metadata: { verifiedById: actor.id, verificationNote: note ?? null },
    });

    return updated;
  }
}

export const journalService = new JournalService();
