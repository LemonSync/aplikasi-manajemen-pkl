import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { initStorage } from './utils/storage';
import { runAllJobs } from './jobs';

/**
 * Entry point server.
 */
const start = async (): Promise<void> => {
  try {
    // Verifikasi koneksi database sebelum menerima trafik
    await prisma.$connect();
    logger.info('Koneksi database berhasil');

    // Pastikan folder storage ada
    initStorage();
    logger.info(`Storage siap di ${env.storageRoot}`);

    // Jalankan cron jobs (setiap jam 17:30 WIB)
    const CRON_INTERVAL = 60 * 60 * 1000; // 1 jam
    setInterval(() => {
      void runAllJobs();
    }, CRON_INTERVAL);
    void runAllJobs(); // jalankan sekali saat startup
    logger.info('Cron jobs diaktifkan (interval: 1 jam)');

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info(`${env.APP_NAME} berjalan di ${env.APP_URL} (mode: ${env.NODE_ENV})`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Menerima ${signal}, mematikan server...`);
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('Server dihentikan dengan aman');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason });
    });
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });
  } catch (err) {
    logger.error('Gagal memulai server', { error: (err as Error).message });
    process.exit(1);
  }
};

void start();
