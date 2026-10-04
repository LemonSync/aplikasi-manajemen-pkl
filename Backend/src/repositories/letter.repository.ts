import { GeneratedLetter, LetterSignatory, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository penandatangan surat (kepala sekolah).
 */
export class LetterSignatoryRepository {
  /**
   * Pejabat penandatangan yang berlaku hari ini:
   * aktif, serta berada dalam periode jabatan (startDate..endDate bila diisi).
   */
  async findActive(): Promise<LetterSignatory | null> {
    const today = new Date();
    return prisma.letterSignatory.findFirst({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: today } }] },
          { OR: [{ endDate: null }, { endDate: { gte: today } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMany(): Promise<LetterSignatory[]> {
    return prisma.letterSignatory.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string): Promise<LetterSignatory | null> {
    return prisma.letterSignatory.findUnique({ where: { id } });
  }

  async create(data: Prisma.LetterSignatoryCreateInput): Promise<LetterSignatory> {
    return prisma.letterSignatory.create({ data });
  }

  /** Menetapkan satu penandatangan aktif (menonaktifkan yang lain). */
  async setActive(id: string): Promise<void> {
    await prisma.$transaction([
      prisma.letterSignatory.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      prisma.letterSignatory.update({ where: { id }, data: { isActive: true } }),
    ]);
  }
}

export const letterSignatoryRepository = new LetterSignatoryRepository();

/**
 * Repository surat hasil generate.
 */
export class GeneratedLetterRepository {
  async create(data: Prisma.GeneratedLetterCreateInput): Promise<GeneratedLetter> {
    return prisma.generatedLetter.create({ data });
  }

  async findById(id: string): Promise<GeneratedLetter | null> {
    return prisma.generatedLetter.findUnique({ where: { id } });
  }

  async findMany(where: Prisma.GeneratedLetterWhereInput): Promise<GeneratedLetter[]> {
    return prisma.generatedLetter.findMany({ where, orderBy: { createdAt: 'desc' } });
  }
}

export const generatedLetterRepository = new GeneratedLetterRepository();
