import { Registration, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

const studentInclude = {
  student: {
    select: {
      id: true,
      username: true,
      studentProfile: {
        select: {
          fullName: true,
          nisn: true,
          class: { select: { name: true } },
        },
      },
    },
  },
} as const;

const baseInclude = {
  ...studentInclude,
  company: { include: { industry: { select: { name: true } } } },
  cohort: true,
  major: true,
  document: { include: { files: { where: { isActive: true } } } },
} as const;

export type RegistrationWithRelations = Prisma.RegistrationGetPayload<{
  include: typeof baseInclude;
}>;

/**
 * Repository pendaftaran PKL per siswa (Fase 1).
 */
export class RegistrationRepository {
  async findById(id: string): Promise<RegistrationWithRelations | null> {
    return prisma.registration.findFirst({
      where: { id, deletedAt: null },
      include: baseInclude,
    });
  }

  /** Pendaftaran aktif (belum dihapus) milik seorang siswa. */
  async findActiveByStudent(studentId: string): Promise<RegistrationWithRelations | null> {
    return prisma.registration.findFirst({
      where: {
        studentId,
        deletedAt: null,
        status: { in: ['DRAFT', 'DIAJUKAN', 'DISETUJUI'] },
      },
      include: baseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async paginate(
    where: Prisma.RegistrationWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: RegistrationWithRelations[]; total: number }> {
    const base: Prisma.RegistrationWhereInput = { deletedAt: null, ...where };
    const [items, total] = await Promise.all([
      prisma.registration.findMany({
        where: base,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: baseInclude,
      }),
      prisma.registration.count({ where: base }),
    ]);
    return { items, total };
  }

  async create(data: Prisma.RegistrationCreateInput): Promise<Registration> {
    return prisma.registration.create({ data });
  }

  async update(id: string, data: Prisma.RegistrationUpdateInput): Promise<Registration> {
    return prisma.registration.update({ where: { id }, data });
  }

  /** Hitung jumlah registrasi pada tahun tertentu (untuk generate kode). */
  async countByCodePrefix(prefix: string): Promise<number> {
    return prisma.registration.count({ where: { code: { startsWith: prefix } } });
  }
}

export const registrationRepository = new RegistrationRepository();
