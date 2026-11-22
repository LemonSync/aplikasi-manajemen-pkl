import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { configureAntiSpam } from './waAntiSpam';
import { waClient } from './waClient';
import { waGroupService } from './waGroup.service';
import { waReplier } from './waReplier.service';
import { waSettings } from './waSettings';

/**
 * Composition root bot WhatsApp: satu tempat yang merangkai koneksi,
 * handler pesan masuk, dan kebijakan "kapan boleh keluar pesan".
 * Bot tidak pernah memulai percakapan pribadi — grup saja yang aktif.
 */
export class WaRuntime {
  /** Nyalakan bot saat aplikasi start (hanya bila kill-switch env DAN setting aktif). */
  async bootstrap(): Promise<void> {
    if (!env.waEnabled) {
      logger.info('WA: bot tidak aktif (WA_ENABLED=false)');
      return;
    }
    const settings = await waSettings.getAll();
    configureAntiSpam(settings.spam);
    if (!settings.enabled) {
      logger.info('WA: bot dimatikan dari pengaturan Config');
      return;
    }
    waClient.setInboundHandler(async (sock, messages) => {
      await waReplier.handle(sock, messages);
    });
    try {
      await waClient.start();
      logger.info('WA: koneksi bot dimulai');
    } catch (err) {
      logger.error('WA: gagal memulai koneksi bot', { error: (err as Error).message });
    }
  }

  /** Aktif/nonaktif dari UI Config: sambungkan atau putuskan saat itu juga. */
  async applyEnabled(enabled: boolean): Promise<void> {
    if (!enabled) {
      await waClient.stop();
      return;
    }
    if (!env.waEnabled) {
      logger.warn('WA: setting aktif tetapi WA_ENABLED=false di server, bot tidak dinyalakan');
      return;
    }
    waClient.setInboundHandler(async (sock, messages) => {
      await waReplier.handle(sock, messages);
    });
    await waClient.start();
  }

  /**
   * Buat grup untuk gelombang baru. Dipanggil api-nyala (fire-and-forget) dari
   * cohortManage.service: status WhatsApp tidak boleh membuat POST /cohorts gagal.
   */
  async maybeCreateGroupForCohort(cohortId: string): Promise<void> {
    try {
      const settings = await waSettings.getAll();
      if (!env.waEnabled || !settings.enabled || !settings.groupEnabled) return;
      if (!waClient.isConnected()) {
        logger.warn('WA: grup gelombang ditunda karena bot belum terhubung', { cohortId });
        return;
      }
      const { group, isNew, addedAdmins, skippedAdmins } = await waGroupService.ensureForCohort(cohortId);
      if (isNew) {
        logger.info('WA: grup gelombang siap', {
          cohortId,
          jid: group.jid,
          adminDimasukkan: addedAdmins.length,
          adminDilewati: skippedAdmins,
        });
      }
    } catch (err) {
      logger.warn('WA: gagal membuat grup gelombang', { cohortId, error: (err as Error).message });
    }
  }
}

export const waRuntime = new WaRuntime();
