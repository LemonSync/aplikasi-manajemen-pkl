import { Group, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Field user yang aman dikirim ke klien — `passwordHash` tidak pernah ikut
 * (response kelompok bisa dibaca siswa/ketua/guru, hash password bukan hak mereka).
 */
const userSafeSelect = {
  id: true,
  username: true,
  identifier: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  phase: true,
  cohortId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type MemberUserSelect = typeof userSafeSelect & { studentProfile: true };
type SupervisorUserSelect = typeof userSafeSelect & { teacherProfile: true };

export type GroupWithRelations = Prisma.GroupGetPayload<{
  include: {
    members: { include: { user: { select: MemberUserSelect } } };
    supervisors: { include: { user: { select: SupervisorUserSelect } } };
    company: { include: { mentors: { include: { user: { select: typeof userSafeSelect } } } } };
    dudiMentors: { include: { dudi: { select: typeof userSafeSelect } } };
    major: true;
    cohort: true;
  };
}>;

/**
 * Repository kelompok PKL.
 */
export class GroupRepository {
  async findById(id: string): Promise<Group | null> {
    return prisma.group.findFirst({ where: { id, deletedAt: null } });
  }

  async findByIdWithRelations(id: string): Promise<GroupWithRelations | null> {
    return prisma.group.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: { include: { user: { select: { ...userSafeSelect, studentProfile: true } } } },
        supervisors: { include: { user: { select: { ...userSafeSelect, teacherProfile: true } } } },
        company: { include: { mentors: { include: { user: { select: userSafeSelect } } } } },
        dudiMentors: { include: { dudi: { select: userSafeSelect } } },
        major: true,
        cohort: true,
      },
    });
  }

  async findByRegistration(registrationId: string): Promise<Group | null> {
    return prisma.group.findFirst({ where: { registrationId, deletedAt: null } });
  }

  /** Kelompok yang diikuti siswa (via keanggotaan). */
  async findByMember(userId: string): Promise<GroupWithRelations[]> {
    return prisma.group.findMany({
      where: { deletedAt: null, members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { ...userSafeSelect, studentProfile: true } } } },
        supervisors: { include: { user: { select: { ...userSafeSelect, teacherProfile: true } } } },
        company: { include: { mentors: { include: { user: { select: userSafeSelect } } } } },
        dudiMentors: { include: { dudi: { select: userSafeSelect } } },
        major: true,
        cohort: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Kelompok aktif (belum selesai) yang diikuti siswa — dipakai Fase 3. */
  async findActiveByMember(userId: string): Promise<Group | null> {
    return prisma.group.findFirst({
      where: {
        deletedAt: null,
        status: { not: 'SELESAI' },
        members: { some: { userId } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async paginate(
    where: Prisma.GroupWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: GroupWithRelations[]; total: number }> {
    const base: Prisma.GroupWhereInput = { deletedAt: null, ...where };
    const [items, total] = await Promise.all([
      prisma.group.findMany({
        where: base,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          members: { include: { user: { select: { ...userSafeSelect, studentProfile: true } } } },
          supervisors: { include: { user: { select: { ...userSafeSelect, teacherProfile: true } } } },
          company: { include: { mentors: { include: { user: { select: userSafeSelect } } } } },
          dudiMentors: { include: { dudi: { select: userSafeSelect } } },
          major: true,
          cohort: true,
        },
      }),
      prisma.group.count({ where: base }),
    ]);
    return { items, total };
  }

  async create(data: Prisma.GroupCreateInput): Promise<Group> {
    return prisma.group.create({ data });
  }

  async update(id: string, data: Prisma.GroupUpdateInput): Promise<Group> {
    return prisma.group.update({ where: { id }, data });
  }

  async countByCodePrefix(prefix: string): Promise<number> {
    return prisma.group.count({ where: { code: { startsWith: prefix } } });
  }
}

export const groupRepository = new GroupRepository();
