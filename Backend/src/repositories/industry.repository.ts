import { Industry, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository bidang industri.
 */
export class IndustryRepository {
  async findById(id: string): Promise<Industry | null> {
    return prisma.industry.findUnique({ where: { id } });
  }

  async findMany(): Promise<Industry[]> {
    return prisma.industry.findMany({ orderBy: { name: 'asc' } });
  }

  async findByName(name: string): Promise<Industry | null> {
    return prisma.industry.findUnique({ where: { name } });
  }

  /** Cari berdasarkan nama, buat bila belum ada (untuk input bebas dari siswa). */
  async findOrCreateByName(name: string): Promise<Industry> {
    const trimmed = name.trim();
    return prisma.industry.upsert({
      where: { name: trimmed },
      update: {},
      create: { name: trimmed },
    });
  }

  async create(data: Prisma.IndustryCreateInput): Promise<Industry> {
    return prisma.industry.create({ data });
  }
}

export const industryRepository = new IndustryRepository();
