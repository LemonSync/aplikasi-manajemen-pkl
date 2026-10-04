import { StudentRegistry } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository Master Siswa (StudentRegistry).
 */
export class StudentRegistryRepository {
  async findByNisn(nisn: string, cohortId: string): Promise<StudentRegistry | null> {
    return prisma.studentRegistry.findFirst({
      where: { nisn, cohortId, isActive: true },
    });
  }

  async findById(id: string): Promise<StudentRegistry | null> {
    return prisma.studentRegistry.findFirst({
      where: { id, isActive: true },
    });
  }

  /** Soft delete: sembunyikan dari daftar/lookup; import ulang Excel memulihkan. */
  async softDelete(id: string): Promise<void> {
    await prisma.studentRegistry.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findManyByNisn(nisns: string[], cohortId: string): Promise<StudentRegistry[]> {
    return prisma.studentRegistry.findMany({
      where: { nisn: { in: nisns }, cohortId, isActive: true },
    });
  }

  /** Semua baris NISN (tanpa filter gelombang/isActive) + nama gelombang — untuk deteksi duplikat lintas gelombang. */
  async findManyByNisnGlobal(nisns: string[]) {
    if (nisns.length === 0) return [];
    return prisma.studentRegistry.findMany({
      where: { nisn: { in: nisns } },
      include: { cohort: { select: { name: true } } },
    });
  }

  async findByCohort(cohortId: string, skip: number, take: number) {
    const where = { cohortId, isActive: true };
    const [items, total] = await Promise.all([
      prisma.studentRegistry.findMany({
        where,
        skip,
        take,
        orderBy: { nisn: 'asc' },
        include: { major: true },
      }),
      prisma.studentRegistry.count({ where }),
    ]);
    return { items, total };
  }

  async upsert(data: {
    nisn: string;
    fullName: string;
    className: string;
    cohortId: string;
    majorId?: string | null;
  }): Promise<StudentRegistry> {
    return prisma.studentRegistry.upsert({
      where: { nisn: data.nisn },
      update: {
        fullName: data.fullName,
        className: data.className,
        cohortId: data.cohortId,
        majorId: data.majorId ?? null,
        isActive: true,
      },
      create: {
        nisn: data.nisn,
        fullName: data.fullName,
        className: data.className,
        cohortId: data.cohortId,
        majorId: data.majorId ?? null,
      },
    });
  }

  async upsertMany(items: Array<{
    nisn: string;
    fullName: string;
    className: string;
    cohortId: string;
    majorId?: string | null;
  }>): Promise<{ created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const existing = await prisma.studentRegistry.findUnique({ where: { nisn: item.nisn } });
        if (existing) {
          await prisma.studentRegistry.update({
            where: { nisn: item.nisn },
            data: {
              fullName: item.fullName,
              className: item.className,
              cohortId: item.cohortId,
              majorId: item.majorId ?? null,
              isActive: true,
            },
          });
          updated++;
        } else {
          await prisma.studentRegistry.create({
            data: {
              nisn: item.nisn,
              fullName: item.fullName,
              className: item.className,
              cohortId: item.cohortId,
              majorId: item.majorId ?? null,
            },
          });
          created++;
        }
      } catch (e) {
        errors.push(`NISN ${item.nisn}: ${(e as Error).message}`);
      }
    }

    return { created, updated, errors };
  }

  async countByCohort(cohortId: string): Promise<number> {
    return prisma.studentRegistry.count({ where: { cohortId, isActive: true } });
  }
}

export const studentRegistryRepository = new StudentRegistryRepository();
