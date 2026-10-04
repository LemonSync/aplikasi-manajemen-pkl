import { Prisma, RegistrationMember } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository anggota pendaftaran.
 */
export class RegistrationMemberRepository {
  async findByRegistration(registrationId: string): Promise<RegistrationMember[]> {
    return prisma.registrationMember.findMany({
      where: { registrationId },
      orderBy: { isLeader: 'desc' },
    });
  }

  async deleteByRegistration(registrationId: string): Promise<void> {
    await prisma.registrationMember.deleteMany({ where: { registrationId } });
  }

  async createMany(
    registrationId: string,
    members: Omit<Prisma.RegistrationMemberCreateManyInput, 'registrationId'>[]
  ): Promise<number> {
    const result = await prisma.registrationMember.createMany({
      data: members.map((m) => ({ ...m, registrationId })),
    });
    return result.count;
  }
}

export const registrationMemberRepository = new RegistrationMemberRepository();
