import { Cohort, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository gelombang (cohort).
 */
export class CohortRepository {
  async findById(id: string): Promise<Cohort | null> {
    return prisma.cohort.findFirst({ where: { id, deletedAt: null } });
  }

  async findMany(where: Prisma.CohortWhereInput = {}): Promise<Cohort[]> {
    return prisma.cohort.findMany({
      where: { deletedAt: null, ...where },
      orderBy: { createdAt: 'desc' },
    });
  }

  async paginate(
    where: Prisma.CohortWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: Cohort[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.cohort.findMany({
        where: { deletedAt: null, ...where },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cohort.count({ where: { deletedAt: null, ...where } }),
    ]);
    return { items, total };
  }

  async create(data: Prisma.CohortCreateInput): Promise<Cohort> {
    return prisma.cohort.create({ data });
  }

  async update(id: string, data: Prisma.CohortUpdateInput): Promise<Cohort> {
    return prisma.cohort.update({ where: { id }, data });
  }

  async count(): Promise<number> {
    return prisma.cohort.count({ where: { deletedAt: null } });
  }
}

export const cohortRepository = new CohortRepository();
