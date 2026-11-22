import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';

export type WaLogDirection = 'IN' | 'OUT';

/**
 * Jejak percakapan customer service. Ditulis untuk keperluan audit UI Config,
 * dan dipangkas sesuai retensi (wa.log.retentionDays).
 */
export class WaLogService {
  async record(direction: WaLogDirection, chatJid: string, senderJid: string | null, kind: string, body: string | null): Promise<void> {
    try {
      await prisma.waMessageLog.create({
        data: {
          direction,
          chatJid: chatJid.slice(0, 60),
          senderJid: senderJid ? senderJid.slice(0, 60) : null,
          kind: kind.slice(0, 40),
          body: body ? body.slice(0, 4000) : null,
        },
      });
    } catch (err) {
      // Log percakapan tidak boleh menggagalkan balasan bot.
      logger.warn('WA: gagal mencatat log percakapan', { error: (err as Error).message });
    }
  }

  /**
   * Jumlah balasan yang sudah dikirim ke satu chat dalam jendela waktu — bahan
   * hitungan anti-spam. Reaksi dan kegagalan tidak dihitung: kalau dihitung, chat
   * yang sedang cooldown tidak akan pernah pulih. -1 berarti log tidak terbaca,
   * pemakai jatuh ke hitungan lokal.
   */
  async sentInWindow(chatJid: string, windowMs: number): Promise<number> {
    try {
      return await prisma.waMessageLog.count({
        where: {
          chatJid,
          direction: 'OUT',
          kind: { notIn: ['react', 'error'] },
          createdAt: { gte: new Date(Date.now() - windowMs) },
        },
      });
    } catch (err) {
      logger.warn('WA: gagal menghitung balasan untuk anti-spam', { error: (err as Error).message });
      return -1;
    }
  }

  /** Percakapan terbaru untuk halaman Config. */
  async recent(limit = 100) {
    return prisma.waMessageLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 500) });
  }

  /** Hapus log lebih tua dari retensi. Berkas belum ada bila retensi = 0. */
  async prune(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const { count } = await prisma.waMessageLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
  }
}

export const waLog = new WaLogService();
