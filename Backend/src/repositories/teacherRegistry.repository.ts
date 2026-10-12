import { TeacherRegistry } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository Master Guru (TeacherRegistry).
 */
export class TeacherRegistryRepository {
  async findByNip(nip: string, cohortId: string): Promise<TeacherRegistry | null> {
    return prisma.teacherRegistry.findFirst({
      where: { nip, cohortId, isActive: true },
    });
  }

  async findById(id: string): Promise<TeacherRegistry | null> {
    return prisma.teacherRegistry.findFirst({
      where: { id, isActive: true },
    });
  }

  /** Soft delete: sembunyikan dari daftar; import ulang Excel memulihkan. */
  async softDelete(id: string): Promise<void> {
    await prisma.teacherRegistry.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Semua baris NIP (tanpa filter gelombang/isActive) + nama gelombang — untuk deteksi duplikat lintas gelombang. */
  async findManyByNipGlobal(nips: string[]) {
    if (nips.length === 0) return [];
    return prisma.teacherRegistry.findMany({
      where: { nip: { in: nips } },
      include: { cohort: { select: { name: true } } },
    });
  }

  async findByCohort(cohortId: string, skip: number, take: number, search?: string) {
    const where: Record<string, unknown> = { cohortId, isActive: true };
    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { nip: { contains: search } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.teacherRegistry.findMany({
        where,
        skip,
        take,
        orderBy: { nip: 'asc' },
        include: { major: true },
      }),
      prisma.teacherRegistry.count({ where }),
    ]);
    return { items, total };
  }

  /** Semua baris aktif satu gelombang — untuk pembuatan akun otomatis. */
  async findActiveByCohort(cohortId: string): Promise<TeacherRegistry[]> {
    return prisma.teacherRegistry.findMany({
      where: { cohortId, isActive: true },
      orderBy: { nip: 'asc' },
    });
  }

  async upsert(data: {
    nip: string;
    fullName: string;
    cohortId: string;
    majorId?: string | null;
  }): Promise<TeacherRegistry> {
    return prisma.teacherRegistry.upsert({
      where: { nip: data.nip },
      update: {
        fullName: data.fullName,
        cohortId: data.cohortId,
        majorId: data.majorId ?? null,
        isActive: true,
      },
      create: {
        nip: data.nip,
        fullName: data.fullName,
        cohortId: data.cohortId,
        majorId: data.majorId ?? null,
      },
    });
  }

  async upsertMany(items: Array<{
    nip: string;
    fullName: string;
    cohortId: string;
    majorId?: string | null;
  }>): Promise<{ created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const existing = await prisma.teacherRegistry.findUnique({ where: { nip: item.nip } });
        if (existing) {
          await prisma.teacherRegistry.update({
            where: { nip: item.nip },
            data: {
              fullName: item.fullName,
              cohortId: item.cohortId,
              majorId: item.majorId ?? null,
              isActive: true,
            },
          });
          updated++;
        } else {
          await prisma.teacherRegistry.create({
            data: {
              nip: item.nip,
              fullName: item.fullName,
              cohortId: item.cohortId,
              majorId: item.majorId ?? null,
            },
          });
          created++;
        }
      } catch (e) {
        errors.push(`NIP ${item.nip}: ${(e as Error).message}`);
      }
    }

    return { created, updated, errors };
  }

  async countByCohort(cohortId: string): Promise<number> {
    return prisma.teacherRegistry.count({ where: { cohortId, isActive: true } });
  }
}

export const teacherRegistryRepository = new TeacherRegistryRepository();
