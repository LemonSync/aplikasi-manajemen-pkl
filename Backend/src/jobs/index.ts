import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

/**
 * Cron job: auto-close absensi yang belum check-out.
 * Dijalankan setiap hari setelah jam PKL selesai (misal 17:00 WIB).
 */
export const autoCloseAttendance = async (): Promise<void> => {
  try {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const cutoff = new Date(`${today}T17:00:00+07:00`);

    if (new Date() < cutoff) return; // belum waktunya

    const openAttendances = await prisma.attendance.findMany({
      where: {
        date: new Date(`${today}T00:00:00+07:00`),
        checkOutAt: null,
        checkInAt: { not: null },
      },
    });

    for (const att of openAttendances) {
      await prisma.attendance.update({
        where: { id: att.id },
        data: { checkOutAt: cutoff },
      });
    }

    if (openAttendances.length > 0) {
      logger.info(`Auto-close: ${openAttendances.length} absensi ditutup otomatis`);
    }
  } catch (err) {
    logger.error('Gagal auto-close absensi', { error: (err as Error).message });
  }
};

/**
 * Cron job: hapus refresh token yang sudah expired.
 */
export const cleanupExpiredTokens = async (): Promise<void> => {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        revokedAt: null,
      },
    });
    if (result.count > 0) {
      logger.info(`Cleanup: ${result.count} expired refresh tokens dihapus`);
    }
  } catch (err) {
    logger.error('Gagal cleanup expired tokens', { error: (err as Error).message });
  }
};

/**
 * Cron job: archive gelombang yang sudah lewat endDate.
 */
export const autoArchiveCohorts = async (): Promise<void> => {
  try {
    const now = new Date();
    const result = await prisma.cohort.updateMany({
      where: {
        status: 'CLOSED',
        endDate: { lt: now },
      },
      data: { status: 'ARCHIVED' },
    });
    if (result.count > 0) {
      logger.info(`Archive: ${result.count} gelombang diarsipkan otomatis`);
    }
  } catch (err) {
    logger.error('Gagal auto-archive cohorts', { error: (err as Error).message });
  }
};

/**
 * Semua cron jobs — dipanggil dari scheduler.
 */
export const runAllJobs = async (): Promise<void> => {
  await autoCloseAttendance();
  await cleanupExpiredTokens();
  await autoArchiveCohorts();
};
