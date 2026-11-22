import { StudentPhase } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { NotFoundError } from '../../errors/AppError';
import { PhaseScheduleService, phaseScheduleService } from '../phaseSchedule.service';
import { waClient } from './waClient';
import { waLog } from './waLog.service';
import { waSettings } from './waSettings';
import { sendHidetag } from './waSend';

type ReminderKind = 'START' | 'END';

export interface ReminderRunResult {
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
}

/** Kunci hari YYYY-MM-DD pada timezone sekolah. */
const dayKey = (date: Date): string => date.toLocaleDateString('sv-SE', { timeZone: env.TIMEZONE });

const longDate = (date: Date): string =>
  date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: env.TIMEZONE,
  });

/** Pesan per fase; pemicunya enum fase (label bisa diedit), teks ini menuntun tiap peran. */
const PHASE_COPY: Record<StudentPhase, Record<ReminderKind, string>> = {
  [StudentPhase.PRA_PKL]: {
    START: 'Siapkan berkas (tanda tangan, rapor, pas foto) lalu ajukan pendaftaran PKL lewat web. Guru pembimbing: pantau usulan tempat siswa.',
    END: 'Masa pra-pendaftaran berakhir hari ini. Siswa yang belum mendaftar kehilangan kesempatan pada gelombang ini.',
  },
  [StudentPhase.NON_PKL]: {
    START: 'Pendaftaran ulang dibuka. Siswa yang belum ditempatkan: perbarui data dan ajukan/usulkan perusahaan lewat web PKL.',
    END: 'Pendaftaran ulang ditutup hari ini. Cek status ajuan kalian di halaman Pendaftaran.',
  },
  [StudentPhase.PKL_AKTIF]: {
    START: 'Presensi harian mulai. Siswa: isi presensi & catatan kegiatan lewat web setiap hari. Pembimbing: pantau kehadiran siswa bimbingan.',
    END: 'Hari terakhir PKL. Pastikan presensi lengkap dan penilaian perusahaan sudah terunggah.',
  },
  [StudentPhase.PKL_SELESAI]: {
    START: 'PKL selesai. Siswa: unggah laporan akhir dan dokumen penunjang, lalu ajukan sertifikat. Perusahaan: selesaikan penilaian.',
    END: 'Masa pengumpulan dokumen pasca-PKL berakhir. Dokumen yang belum lengkap mempengaruhi penerbitan sertifikat.',
  },
};

/**
 * Pengingat fase untuk grup gelombang, sebagai job idempoten (bukan setTimeout ke
 * 00:00) agar server yang telat/mati tetap mengirim; unique key WaReminderLog
 * menjamin satu fase satu pesan per hari (tanpa dobel).
 */
export class WaReminderService {
  async run(): Promise<ReminderRunResult> {
    const result: ReminderRunResult = { sent: 0, skipped: 0, failed: 0 };

    const settings = await waSettings.getAll();
    if (!env.waEnabled || !settings.enabled || !settings.reminderEnabled) {
      return { ...result, reason: 'bot atau pengingat tidak aktif' };
    }
    if (!waClient.isConnected()) {
      logger.info('WA: pengingat fase dilewati, bot belum terhubung');
      return { ...result, reason: 'bot belum terhubung' };
    }

    const sock = waClient.requireSocket();
    const groups = await prisma.waGroup.findMany({ select: { cohortId: true, jid: true } });
    if (groups.length === 0) return { ...result, reason: 'belum ada grup' };

    const groupByCohort = new Map(groups.map((g) => [g.cohortId, g.jid]));
    const cohorts = await prisma.cohort.findMany({
      where: { id: { in: groups.map((g) => g.cohortId) } },
      select: { id: true, name: true },
    });
    const nameByCohort = new Map(cohorts.map((c) => [c.id, c.name]));

    // Hari ini + kemarin: antisipasi server baru menyala setelah tengah malam.
    const now = new Date();
    const window = new Set([dayKey(now), dayKey(new Date(now.getTime() - 86_400_000))]);

    const schedules = await prisma.phaseSchedule.findMany({
      where: { cohortId: { in: groups.map((g) => g.cohortId) } },
    });

    for (const schedule of schedules) {
      const jid = groupByCohort.get(schedule.cohortId);
      if (!jid) continue;

      const targets: Array<{ kind: ReminderKind; date: Date | null }> = [
        { kind: 'START', date: schedule.startDate },
        { kind: 'END', date: schedule.endDate },
      ];

      for (const target of targets) {
        if (!target.date) continue;
        const key = dayKey(target.date);
        if (!window.has(key)) continue;

        const already = await prisma.waReminderLog.findUnique({
          where: {
            cohortId_phase_kind_dayKey: {
              cohortId: schedule.cohortId,
              phase: schedule.phase,
              kind: target.kind,
              dayKey: key,
            },
          },
        });
        if (already) {
          result.skipped += 1;
          continue;
        }

        const text = this.buildText(nameByCohort.get(schedule.cohortId) ?? 'PKL', schedule.phase, target.kind, target.date);
        let ok = false;
        let detail: string | null = null;
        try {
          await sendHidetag(sock, jid, text);
          ok = true;
        } catch (err) {
          detail = (err as Error).message;
          logger.error('WA: pengingat fase gagal dikirim', {
            cohortId: schedule.cohortId,
            phase: schedule.phase,
            error: detail,
          });
        }

        await prisma.waReminderLog.create({
          data: { cohortId: schedule.cohortId, phase: schedule.phase, kind: target.kind, dayKey: key, ok, detail },
        });
        if (ok) result.sent += 1;
        else result.failed += 1;
      }
    }

    const pruned = await waLog.prune(settings.retentionDays);
    if (pruned > 0) logger.info(`WA: ${pruned} log percakapan kadaluarsa dihapus`);

    return result;
  }

  /** Kirim contoh pengingat sekarang (tombol "Tes Pengingat" pada menu Config). */
  async sendTest(cohortId: string): Promise<{ jid: string; text: string }> {
    const group = await prisma.waGroup.findUnique({ where: { cohortId } });
    if (!group) throw new NotFoundError('Grup untuk gelombang ini belum dibuat');
    const sock = waClient.requireSocket();

    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId }, select: { name: true } });
    const phase = (await phaseScheduleService.getCurrentPhase(cohortId)) ?? StudentPhase.PRA_PKL;
    const text = [
      `*TES PENGINGAT — ${group.subject}*`,
      '',
      this.buildText(cohort?.name ?? 'PKL', phase, 'START', new Date()),
      '',
      '_Pesan ini dikirim manual dari menu Config, bukan hasil penjadwalan otomatis._',
    ].join('\n');

    await sendHidetag(sock, group.jid, text);
    return { jid: group.jid, text };
  }

  /** Bersihkan log kegagalan supaya fase tersebut boleh dicoba ulang. */
  async resetFailed(): Promise<number> {
    const { count } = await prisma.waReminderLog.deleteMany({ where: { ok: false } });
    return count;
  }

  private buildText(cohortName: string, phase: StudentPhase, kind: ReminderKind, date: Date): string {
    const label = PhaseScheduleService.phaseLabel(phase);
    const head =
      kind === 'START'
        ? `🔔 @semua — *${label}* dimulai hari ini, ${longDate(date)}.`
        : `⏳ @semua — *${label}* berakhir hari ini, ${longDate(date)}.`;
    return `${head}\n\n${PHASE_COPY[phase][kind]}\n\n_${cohortName} • Sistem Manajemen PKL_`;
  }
}

export const waReminderService = new WaReminderService();

/** Entri scheduler: tidak pernah melempar, job lain tidak boleh ikut gagal. */
export const runWaPhaseReminders = async (): Promise<void> => {
  try {
    const result = await waReminderService.run();
    if (result.sent || result.failed) {
      logger.info(`WA pengingat fase: terkirim ${result.sent}, gagal ${result.failed}, lewat ${result.skipped}`);
    }
  } catch (err) {
    logger.error('WA: job pengingat fase error', { error: (err as Error).message });
  }
};
