import { Prisma, Role, User } from '@prisma/client';
import { prisma } from '../config/prisma';

/** Bentuk user beserta profil terkait yang biasa dibutuhkan untuk auth. */
export type UserWithProfiles = Prisma.UserGetPayload<{
  include: { studentProfile: true; teacherProfile: true; companyMentor: true };
}>;

/**
 * Repository untuk entitas User (akun & autentikasi).
 */
export class UserRepository {
  /** Cari user berdasarkan username ATAU identifier (NISN/NIP). */
  async findByIdentifierOrUsername(value: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: value }, { identifier: value }],
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByIdWithProfiles(id: string): Promise<UserWithProfiles | null> {
    return prisma.user.findUnique({
      where: { id },
      include: { studentProfile: true, teacherProfile: true, companyMentor: true },
    });
  }

  async usernameExists(username: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { username } });
    return count > 0;
  }

  async identifierExists(identifier: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { identifier } });
    return count > 0;
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async updateLastLogin(id: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  /** Perbarui password hash dan tandai password sudah diganti. */
  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  /**
   * Hapus kredensial awal (password sementara ter-encrypt) setelah pengguna
   * mengganti password sendiri — password lama tidak boleh tetap terbaca
   * ulang oleh siapa pun (termasuk lewat endpoint kredensial admin).
   */
  async clearInitialCredential(userId: string): Promise<void> {
    await prisma.initialCredential.deleteMany({ where: { userId } });
  }

  async countByRole(role: Role): Promise<number> {
    return prisma.user.count({ where: { role, deletedAt: null } });
  }
}

export const userRepository = new UserRepository();
