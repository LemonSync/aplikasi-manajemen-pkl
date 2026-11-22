import { Grade, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export type GradeWithStudent = Prisma.GradeGetPayload<{
  include: { student: { include: { studentProfile: true } }; aspects: true };
}>;

/** Urutan butir = urutan LEMBARAN PENILAIAN (kelompok 1→3, lalu huruf butir). */
const ASPECT_ORDER: Prisma.GradeAspectOrderByWithRelationInput[] = [
  { groupCode: 'asc' },
  { code: 'asc' },
  { createdAt: 'asc' },
];

/**
 * Repository penilaian PKL.
 */
export class GradeRepository {
  async findById(id: string): Promise<GradeWithStudent | null> {
    return prisma.grade.findUnique({
      where: { id },
      include: { student: { include: { studentProfile: true } }, aspects: { orderBy: ASPECT_ORDER } },
    });
  }

  async findUnique(studentId: string, giverRole: Prisma.EnumRoleFilter['equals']): Promise<Grade | null> {
    return prisma.grade.findFirst({
      where: { studentId, giverRole },
    });
  }

  async findMany(where: Prisma.GradeWhereInput): Promise<GradeWithStudent[]> {
    return prisma.grade.findMany({
      where,
      include: { student: { include: { studentProfile: true } }, aspects: { orderBy: ASPECT_ORDER } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: Prisma.GradeCreateInput): Promise<Grade> {
    return prisma.grade.create({ data });
  }

  async upsertByStudentAndGiver(
    studentId: string,
    giverRole: Prisma.EnumRoleFilter['equals'],
    create: Prisma.GradeCreateInput,
    update: Prisma.GradeUpdateInput
  ): Promise<Grade> {
    const existing = await prisma.grade.findFirst({ where: { studentId, giverRole } });
    if (existing) {
      return prisma.grade.update({ where: { id: existing.id }, data: update });
    }
    return prisma.grade.create({ data: create });
  }

  async paginate(
    where: Prisma.GradeWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: GradeWithStudent[]; total: number }> {
    const [items, total] = await Promise.all([
      prisma.grade.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { student: { include: { studentProfile: true } }, aspects: { orderBy: ASPECT_ORDER } },
      }),
      prisma.grade.count({ where }),
    ]);
    return { items, total };
  }
}

export const gradeRepository = new GradeRepository();
