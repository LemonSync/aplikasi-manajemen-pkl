import { Request, Response } from 'express';
import { env } from '../config/env';
import { BadRequestError } from '../errors/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { waClient } from '../services/wa/waClient';
import { waSettings } from '../services/wa/waSettings';
import { waRuntime } from '../services/wa/waRuntime';
import { waGroupService } from '../services/wa/waGroup.service';
import { waGuideService } from '../services/wa/waGuide.service';
import { waReminderService } from '../services/wa/waReminder.service';
import { waLog } from '../services/wa/waLog.service';
import { CreateWaGuideDTO, ListWaMessageQueryDTO, UpdateWaGuideDTO, UpdateWaSettingsDTO, WaGroupAdoptDTO } from '../validators/wa.validator';
import { EnsureGroupResult, SyncGroupsResult } from '../services/wa/waGroup.service';

/** Pesan keberhasilan yang bisa dibaca admin (bukan sekadar "OK"). */
const groupReadyMessage = (result: EnsureGroupResult): string => {
  const base = `Grup "${result.group.subject}" siap dengan mode pengumuman.`;
  if (result.skippedAdmins.length > 0) {
    return `${base} Admin dimasukkan: ${result.addedAdmins.length}. Nomor dilewati (tidak terdaftar di WhatsApp): ${result.skippedAdmins.join(', ')}.`;
  }
  return result.addedAdmins.length > 0
    ? `${base} ${result.addedAdmins.length} admin ikut dimasukkan.`
    : `${base} Belum ada nomor admin di pengaturan — grup untuk sementara hanya berisi bot.`;
};

const syncMessage = (result: SyncGroupsResult): string => {
  const parts = [`${result.created.length} grup dibuat`, `${result.existing} grup sudah ada`];
  if (result.deferred.length > 0) parts.push(`${result.deferred.length} gelombang ditunda (kuota WhatsApp), jalankan sinkron lagi sebentar lagi`);
  if (result.failed.length > 0) parts.push(`${result.failed.length} gagal: ${result.failed.map((f) => f.error).join(' | ')}`);
  if (result.skippedAdmins.length > 0) parts.push(`nomor admin dilewati: ${result.skippedAdmins.join(', ')}`);
  return `Sinkron grup — ${parts.join('; ')}.`;
};

const adminMessage = (result: { added: string[]; skipped: string[] }): string => {
  if (result.added.length === 0) {
    return result.skipped.length > 0
      ? `Tidak ada admin yang masuk — nomor tidak terdaftar di WhatsApp: ${result.skipped.join(', ')}`
      : 'Tidak ada nomor admin yang diproses.';
  }
  return `${result.added.length} admin dimasukkan ke grup${
    result.skipped.length > 0 ? `; dilewati (tidak terdaftar): ${result.skipped.join(', ')}` : ''
  }.`;
};

/**
 * Endpoint konfigurasi bot WhatsApp — semuanya SUPER_ADMIN
 * (guard dipasang di config.routes.ts sebelum router ini di-mount).
 */
export class WaBotController {
  /** GET /config/wa/status — koneksi + pengaturan + kill-switch server dalam satu panggilan. */
  status = asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(
      res,
      {
        serverEnabled: env.waEnabled,
        connection: waClient.getStatus(),
        settings: await waSettings.getAll(),
        guideCount: await waGuideService.list().then((g) => g.length),
      },
      'OK'
    );
  });

  /**
   * PATCH /config/wa/settings — simpan lalu hubungkan/putuskan sesuai toggle aktif.
   * Perubahan enabled juga ditulis ke setting agar status koneksi tidak menyalahi UI.
   */
  updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const dto = req.body as UpdateWaSettingsDTO;
    const settings = await waSettings.update(dto, req.user!.sub);
    if (dto.enabled !== undefined) await waRuntime.applyEnabled(settings.enabled);
    sendSuccess(res, { settings, connection: waClient.getStatus() }, 'Pengaturan bot disimpan');
  });

  settings = asyncHandler(async (_req: Request, res: Response) =>
    sendSuccess(res, await waSettings.getAll(), 'OK')
  );

  /** POST /config/wa/start — mulai koneksi (QR muncul di GET /qr). */
  start = asyncHandler(async (req: Request, res: Response) => {
    if (!env.waEnabled) {
      throw new BadRequestError(
        'Bot tidak dapat dinyalakan: WA_ENABLED=false pada server. Ubah berkas environment lalu mulai ulang backend.'
      );
    }
    await waSettings.update({ enabled: true }, req.user!.sub);
    await waRuntime.applyEnabled(true);
    return sendSuccess(res, waClient.getStatus(), 'Koneksi bot dimulai — scan QR atau minta kode pairing');
  });

  /** POST /config/wa/stop — putus koneksi, sesi (kredensial) tetap tersimpan. */
  stop = asyncHandler(async (req: Request, res: Response) => {
    await waSettings.update({ enabled: false }, req.user!.sub);
    await waRuntime.applyEnabled(false);
    sendSuccess(res, waClient.getStatus(), 'Koneksi bot dihentikan');
  });

  /** POST /config/wa/logout — keluar permanen + hapus kredensial lokal. */
  logout = asyncHandler(async (_req: Request, res: Response) =>
    sendSuccess(res, await waClient.logout(), 'Sesi bot keluar, kredensial lokal dihapus')
  );

  qr = asyncHandler(async (_req: Request, res: Response) => {
    const { qr, state } = waClient.getStatus();
    if (!qr) {
      return sendSuccess(res, { qr: null, state }, 'Belum ada QR saat ini (bot mungkin sudah terhubung). Mulai ulang koneksi untuk mendapatkan QR baru.', 200);
    }
    return sendSuccess(res, { qr, state }, 'OK');
  });

  /**
   * POST /config/wa/pairing — kode 8 karakter untuk menautkan nomor tanpa QR.
   * Menautkan = maksud admin menyalakan bot, jadi setting aktif ikut ditulis dan koneksi
   * dimulai lewat runtime (hanya waClient.start() tidak memasang handler pesan masuk).
   */
  pairing = asyncHandler(async (req: Request, res: Response) => {
    if (!env.waEnabled) {
      throw new BadRequestError(
        'Bot tidak dapat ditautkan: WA_ENABLED=false pada server. Ubah berkas environment lalu mulai ulang backend.'
      );
    }
    await waSettings.update({ enabled: true }, req.user!.sub);
    await waRuntime.applyEnabled(true);
    const code = await waClient.requestPairingCode((req.body as { number: string }).number);
    sendSuccess(res, { code }, `Masukkan kode ${code} di WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon`);
  });

  groups = asyncHandler(async (_req: Request, res: Response) =>
    sendSuccess(res, await waGroupService.list(), 'OK')
  );

  /** POST /config/wa/groups — buat grup untuk satu gelombang (idempoten). */
  createGroup = asyncHandler(async (req: Request, res: Response) => {
    const result = await waGroupService.ensureForCohort((req.body as { cohortId: string }).cohortId);
    sendSuccess(
      res,
      result,
      result.isNew ? groupReadyMessage(result) : 'Grup gelombang ini sudah dibuat sebelumnya.',
      result.isNew ? 201 : 200
    );
  });

  adoptGroup = asyncHandler(async (req: Request, res: Response) => {
    const { cohortId, invite } = req.body as WaGroupAdoptDTO;
    const group = await waGroupService.adoptFromInvite(cohortId, invite);
    sendSuccess(res, group, `Bot bergabung ke "${group.subject}" dan menguncinya ke mode pengumuman.`, 201);
  });

  syncGroups = asyncHandler(async (_req: Request, res: Response) => {
    const result = await waGroupService.syncAll();
    sendSuccess(res, result, syncMessage(result));
  });

  refreshInvite = asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await waGroupService.refreshInvite(req.params.cohortId as string), 'Link grup diperbarui')
  );

  promoteAdmins = asyncHandler(async (req: Request, res: Response) => {
    const { numbers } = req.body as { numbers: string[] };
    const result = await waGroupService.promoteAdmins(req.params.cohortId as string, numbers);
    sendSuccess(res, result, adminMessage(result));
  });

  testReminder = asyncHandler(async (req: Request, res: Response) => {
    const { cohortId } = req.body as { cohortId: string };
    sendSuccess(res, await waReminderService.sendTest(cohortId), 'Pengingat contoh terkirim ke grup');
  });

  runReminders = asyncHandler(async (_req: Request, res: Response) =>
    sendSuccess(res, await waReminderService.run(), 'Pemindaian jadwal fase selesai')
  );

  resetReminders = asyncHandler(async (_req: Request, res: Response) =>
    sendSuccess(res, { reset: await waReminderService.resetFailed() }, 'Pengingat yang gagal boleh dikirim ulang')
  );

  guides = asyncHandler(async (_req: Request, res: Response) =>
    sendSuccess(res, await waGuideService.list(), 'OK')
  );

  createGuide = asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await waGuideService.create(req.body as CreateWaGuideDTO), 'Tombol panduan ditambahkan', 201)
  );

  updateGuide = asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await waGuideService.update(req.params.id as string, req.body as UpdateWaGuideDTO),
      'Tombol panduan diperbarui'
    )
  );

  deleteGuide = asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await waGuideService.remove(req.params.id as string), 'Panduan beserta cabangnya dihapus')
  );

  saveGuideImage = asyncHandler(async (req: Request, res: Response) => {
    const { image } = req.body as { image: string };
    sendSuccess(res, await waGuideService.saveImage(req.params.id as string, image), 'Gambar panduan disimpan');
  });

  deleteGuideImage = asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await waGuideService.removeImage(req.params.id as string), 'Gambar panduan dihapus')
  );

  /** GET /config/wa/messages — percakapan CS terbaru (retensi wa.log.retentionDays). */
  messages = asyncHandler(async (req: Request, res: Response) => {
    const { limit } = req.query as ListWaMessageQueryDTO;
    sendSuccess(res, await waLog.recent(limit ?? 100), 'OK');
  });
}

export const waBotController = new WaBotController();
