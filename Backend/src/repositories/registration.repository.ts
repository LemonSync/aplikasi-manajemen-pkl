import { Registration, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export type RegistrationWithRelations = Prisma.RegistrationGetPayload<{
  include: {
    members: true;
    cohort: true;
    major: true;
    document: { include: { files: true } };
    group: true;
  };
}>;

/**
 * Repository pendaftaran PKL (Fase 1).
 */
export class RegistrationRepository {
  async findById(id: string): Promise<RegistrationWithRelations | null> {
    return prisma.registration.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: { orderBy: { isLeader: 'desc' } },
        cohort: true,
        major: true,
        document: { include: { files: { where: { isActive: true } } } },
        group: true,
      },
    });
  }

  /** Pendaftaran aktif (belum dihapus) milik seorang ketua/siswa. */
  async findActiveByLeader(leaderId: string): Promise<RegistrationWithRelations | null> {
    return prisma.registration.findFirst({
      where: { leaderId, deletedAt: null, status: { in: ['DRAFT', 'DIAJUKAN', 'DISETUJUI'] } },
      include: {
        members: { orderBy: { isLeader: 'desc' } },
        cohort: true,
        major: true,
        document: { include: { files: { where: { isActive: true } } } },
        group: true,
      },
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
        include: {
          members: { orderBy: { isLeader: 'desc' } },
          cohort: true,
          major: true,
          document: { include: { files: { where: { isActive: true } } } },
          group: true,
        },
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
