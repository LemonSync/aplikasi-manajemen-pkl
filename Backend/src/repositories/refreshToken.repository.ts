import { Prisma, RefreshToken } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository untuk refresh token (rotation & revoke multi-device).
 */
export class RefreshTokenRepository {
  async create(data: Prisma.RefreshTokenCreateInput): Promise<RefreshToken> {
    return prisma.refreshToken.create({ data });
  }

  /** Cari token aktif (belum dicabut & belum kedaluwarsa) berdasarkan hash. */
  async findActiveByHash(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async revoke(id: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Hapus token kedaluwarsa (dipanggil oleh cron job). */
  async deleteExpired(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
