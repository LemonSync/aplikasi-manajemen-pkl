import { Company, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export type CompanyWithRelations = Prisma.CompanyGetPayload<{
  include: { industry: true };
}>;

/**
 * Repository perusahaan mitra (DUDI).
 */
export class CompanyRepository {
  async findById(id: string): Promise<Company | null> {
    return prisma.company.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdWithRelations(id: string): Promise<CompanyWithRelations | null> {
    return prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: { industry: true },
    });
  }

  async findByName(name: string): Promise<Company | null> {
    return prisma.company.findFirst({ where: { name, deletedAt: null } });
  }

  async paginate(
    where: Prisma.CompanyWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: CompanyWithRelations[]; total: number }> {
    const base: Prisma.CompanyWhereInput = { deletedAt: null, ...where };
    const [items, total] = await Promise.all([
      prisma.company.findMany({
        where: base,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: { industry: true },
      }),
      prisma.company.count({ where: base }),
    ]);
    return { items, total };
  }

  async create(data: Prisma.CompanyCreateInput): Promise<Company> {
    return prisma.company.create({ data });
  }

  async update(id: string, data: Prisma.CompanyUpdateInput): Promise<Company> {
    return prisma.company.update({ where: { id }, data });
  }
}

export const companyRepository = new CompanyRepository();
