import { Prisma, Visit } from '@prisma/client';
import { prisma } from '../config/prisma';

export type VisitWithRelations = Prisma.VisitGetPayload<{
  include: {
    supervisor: { select: { id: true; username: true } };
    group: { select: { id: true; name: true } };
    company: { select: { id: true; name: true } };
  };
}>;

/**
 * Repository kunjungan/monitoring guru (Fase 3).
 */
export class VisitRepository {
  async findById(id: string): Promise<Visit | null> {
    return prisma.visit.findUnique({ where: { id } });
  }

  async create(data: Prisma.VisitCreateInput): Promise<Visit> {
    return prisma.visit.create({ data });
  }

  async update(id: string, data: Prisma.VisitUpdateInput): Promise<Visit> {
    return prisma.visit.update({ where: { id }, data });
  }

  async paginate(
    where: Prisma.VisitWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: VisitWithRelations[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.visit.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledAt: 'desc' },
        include: {
          supervisor: { select: { id: true, username: true } },
          group: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
      }),
      prisma.visit.count({ where }),
    ]);
    return { items, total };
  }
}

export const visitRepository = new VisitRepository();
