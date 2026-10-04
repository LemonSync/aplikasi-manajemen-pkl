import { Journal, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository jurnal kegiatan harian (Fase 3).
 */
export class JournalRepository {
  async findById(id: string): Promise<Journal | null> {
    return prisma.journal.findUnique({ where: { id } });
  }

  async findByUserAndDate(userId: string, date: Date): Promise<Journal | null> {
    return prisma.journal.findFirst({ where: { userId, date } });
  }

  async create(data: Prisma.JournalCreateInput): Promise<Journal> {
    return prisma.journal.create({ data });
  }

  async update(id: string, data: Prisma.JournalUpdateInput): Promise<Journal> {
    return prisma.journal.update({ where: { id }, data });
  }

  async paginate(
    where: Prisma.JournalWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: Journal[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.journal.findMany({
        where,
        skip,
        take,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { user: { select: { id: true, username: true, studentProfile: { select: { fullName: true, nisn: true } } } }, group: { select: { id: true, name: true } } },
      }),
      prisma.journal.count({ where }),
    ]);
    return { items, total };
  }
}

export const journalRepository = new JournalRepository();
