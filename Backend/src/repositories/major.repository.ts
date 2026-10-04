import { Major, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository jurusan (major).
 */
export class MajorRepository {
  async findById(id: string): Promise<Major | null> {
    return prisma.major.findUnique({ where: { id } });
  }

  async findMany(): Promise<Major[]> {
    return prisma.major.findMany({ orderBy: { name: 'asc' } });
  }

  async create(data: Prisma.MajorCreateInput): Promise<Major> {
    return prisma.major.create({ data });
  }

  async update(id: string, data: Prisma.MajorUpdateInput): Promise<Major> {
    return prisma.major.update({ where: { id }, data });
  }
}

export const majorRepository = new MajorRepository();
