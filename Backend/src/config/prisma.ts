import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Singleton PrismaClient.
 * Di mode development, simpan instance di global untuk mencegah
 * pembuatan koneksi berulang saat hot-reload (tsx watch).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
