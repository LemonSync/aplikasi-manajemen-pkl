import type { WaGroup } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../../errors/AppError';
import { bareNumber, dedupeNumbers, normalizeWaNumber } from './waNumber';
import { sendText } from './waSend';
import { waClient } from './waClient';
import { waSettings } from './waSettings';

/** Batas peserta per panggilan API (chunk kecil agar tidak ditolak server WA). */
const PARTICIPANT_CHUNK = 25;
/** Jeda antar operasi grup agar tidak menabrak rate limit WhatsApp. */
const GROUP_ACTION_DELAY_MS = 3_000;
/** Jeda antar BENTUK JID saat membuat grup. */
const GROUP_RETRY_DELAY_MS = 8_000;
/** Kuota groupCreate di WhatsApp ketat: dua panggilan berdempetan memicu rate-overlimit, jadi percobaan berikutnya ditahan. */
const GROUP_CREATE_COOLDOWN_MS = 45_000;
/** Grup maksimum per panggilan sinkron — sisanya menunggu panggilan berikutnya. */
const MAX_GROUPS_PER_SYNC = 3;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface EnsureGroupResult {
  group: WaGroup;
  /** False bila gelombang ini ternyata sudah punya grup (idempoten). */
  isNew: boolean;
  addedAdmins: string[];
  /** Nomor admin yang dilewati (tidak terdaftar di WhatsApp / bukan nomor valid). */
  skippedAdmins: string[];
}

export interface SyncGroupsResult {
  created: string[];
  failed: Array<{ cohortId: string; error: string }>;
  /** Gelombang yang belum dicoba karena kuota grup habis atau limit per panggilan. */
  deferred: string[];
  skippedAdmins: string[];
  existing: number;
}

/** Teks stanza mentah WhatsApp (rate-overlimit, bad-request, ...) tidak bisa ditindaklanjuti admin, jadi dipetakan ke error aplikasi. */
export const describeWaError = (err: unknown, action: string): Error => {
  const message = (err as Error)?.message ?? String(err ?? '');
  const lower = message.toLowerCase();

  if (lower.includes('rate-overlimit') || lower.includes('rate limit')) {
    return new ConflictError(`WhatsApp sedang membatasi ${action} (rate-overlimit). Tunggu beberapa menit lalu coba lagi.`);
  }
  if (lower.includes('bad-request')) {
    return new BadRequestError(
      `WhatsApp menolak ${action} (bad-request). Biasanya sesi bot sedang dibatasi atau identitas nomor ` +
        'belum diterima server — tunggu beberapa menit, atau tempuh jalur manual (buat grupnya di HP bot, ' +
        'lalu pakai "Gabung Grup" dengan link undangannya).'
    );
  }
  if (lower.includes('not-authorized') || lower.includes('device-offline') || lower.includes('disconnected')) {
    return new BadRequestError('Sesi bot WhatsApp tidak sedang aktif. Sambungkan ulang bot lalu coba lagi.');
  }
  return err instanceof Error ? err : new BadRequestError(message);
};

/**
 * Grup pengumuman per gelombang, dikunci mode announcement; siswa/guru masuk lewat
 * link invite — sistem tidak mengumpulkan nomor WhatsApp siapa pun. GroupCreate
 * selalu berisi peserta bot saja (admin menyusul via groupParticipantsUpdate) supaya
 * nomor admin tak valid tidak memicu `bad-request` dan dua panggilan berdempetan
 * tidak memicu `rate-overlimit`.
 */
export class WaGroupService {
  private lastCreateAttempt = 0;

  async list(): Promise<(WaGroup & { cohortName: string | null; cohortStatus: string | null })[]> {
    const groups = await prisma.waGroup.findMany({
      include: { cohort: { select: { id: true, name: true, status: true, deletedAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return groups.map((g) => ({ ...g, cohortName: g.cohort?.name ?? null, cohortStatus: g.cohort?.status ?? null }));
  }

  /** Idempoten via unique `cohortId`. `skipCooldown` khusus sync: satu panggilan memegang satu slot pembuatan grup. */
  async ensureForCohort(cohortId: string, opts: { skipCooldown?: boolean } = {}): Promise<EnsureGroupResult> {
    const existing = await prisma.waGroup.findUnique({ where: { cohortId } });
    if (existing) return { group: existing, isNew: false, addedAdmins: [], skippedAdmins: [] };

    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    const settings = await waSettings.getAll();
    if (!settings.enabled || !settings.groupEnabled) {
      throw new BadRequestError('Bot atau pembuatan grup otomatis sedang tidak aktif.');
    }

    const sock = waClient.requireSocket();
    const botJid: string = sock.user?.id ?? '';
    if (!botJid) throw new BadRequestError('Identitas bot belum siap, coba lagi sebentar.');

    if (!opts.skipCooldown) this.guardCooldown();

    const subject = `PKL — ${cohort.name}`.slice(0, 75);
    const { groupJid, form } = await this.createGroup(sock, subject, this.participantForms(sock, botJid), cohortId);
    logger.info('WA: grup dibuat', { cohortId, jid: groupJid, participant: form });

    await sleep(GROUP_ACTION_DELAY_MS);
    await this.safeGroupAction(
      () => sock.groupSettingUpdate(groupJid as string, 'announcement'),
      cohortId,
      'kunci announcement'
    );

    const { added: addedAdmins, skipped: skippedAdmins } = await this.addAdmins(
      sock,
      groupJid,
      settings.groupAdmins,
      botJid,
      cohortId
    );

    let invite: string | null = null;
    try {
      const code = await sock.groupInviteCode(groupJid);
      invite = code ? `https://chat.whatsapp.com/${code}` : null;
    } catch (err) {
      logger.warn('WA: gagal mengambil link grup', { cohortId, error: (err as Error).message });
    }

    await sleep(GROUP_ACTION_DELAY_MS);
    await this.safeGroupAction(
      () => sendText(sock, groupJid, this.introText(cohort.name, invite, addedAdmins.length)),
      cohortId,
      'pesan pembuka grup'
    );

    const group = await prisma.waGroup.create({
      data: { cohortId, jid: groupJid.slice(0, 60), subject, invite },
    });
    logger.info('WA: grup gelombang siap', {
      cohortId,
      jid: group.jid,
      adminDimasukkan: addedAdmins.length,
      adminDilewati: skippedAdmins,
    });

    return { group, isNew: true, addedAdmins, skippedAdmins };
  }

  /** Ambil ulang link invite (mis. setelah admin merevoke link lama). */
  async refreshInvite(cohortId: string): Promise<WaGroup> {
    const group = await prisma.waGroup.findUnique({ where: { cohortId } });
    if (!group) throw new NotFoundError('Grup untuk gelombang ini belum dibuat');
    const sock = waClient.requireSocket();
    try {
      const code = await sock.groupInviteCode(group.jid);
      if (!code) throw new BadRequestError('WhatsApp tidak mengembalikan kode invite.');
      return await prisma.waGroup.update({ where: { id: group.id }, data: { invite: `https://chat.whatsapp.com/${code}` } });
    } catch (err) {
      throw describeWaError(err, 'pengambilan link grup');
    }
  }

  /** Buat grup untuk gelombang aktif yang belum punya (maks ${MAX_GROUPS_PER_SYNC} per panggilan). */
  async syncAll(): Promise<SyncGroupsResult> {
    const settings = await waSettings.getAll();
    if (!settings.enabled || !settings.groupEnabled) {
      throw new BadRequestError('Bot atau pembuatan grup otomatis sedang tidak aktif.');
    }

    const [cohorts, withGroup] = await Promise.all([
      prisma.cohort.findMany({
        where: { deletedAt: null, status: { notIn: ['ARCHIVED'] } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.waGroup.findMany({ select: { cohortId: true } }),
    ]);
    const covered = new Set(withGroup.map((g) => g.cohortId));
    const pending = cohorts.filter((c) => !covered.has(c.id)).map((c) => c.id);

    const result: SyncGroupsResult = {
      created: [],
      failed: [],
      deferred: [],
      skippedAdmins: [],
      existing: cohorts.length - pending.length,
    };

    for (let i = 0; i < pending.length; i++) {
      const cohortId = pending[i];
      if (result.created.length >= MAX_GROUPS_PER_SYNC) {
        result.deferred.push(...pending.slice(i));
        break;
      }

      try {
        const { skippedAdmins } = await this.ensureForCohort(cohortId, { skipCooldown: i > 0 });
        result.created.push(cohortId);
        result.skippedAdmins.push(...skippedAdmins);
      } catch (err) {
        const mapped = describeWaError(err, 'pembuatan grup');
        if (mapped instanceof ConflictError) {
          // Kuota grup habis: berhenti lebih penting daripada menghabiskan sisa permintaan.
          result.deferred.push(...pending.slice(i));
          logger.warn('WA: sinkron grup dihentikan oleh WhatsApp', { cohortId, error: mapped.message });
          break;
        }
        result.failed.push({ cohortId, error: mapped.message });
      }

      await sleep(GROUP_ACTION_DELAY_MS);
    }

    return { ...result, skippedAdmins: dedupeNumbers(result.skippedAdmins) };
  }

  /** Masukkan + promosikan nomor admin tertentu pada satu grup. */
  async promoteAdmins(cohortId: string, numbers: string[]): Promise<{ added: string[]; skipped: string[] }> {
    const group = await prisma.waGroup.findUnique({ where: { cohortId } });
    if (!group) throw new NotFoundError('Grup untuk gelombang ini belum dibuat');
    const sock = waClient.requireSocket();
    try {
      return await this.addAdmins(sock, group.jid, numbers, sock.user?.id ?? '', cohortId);
    } catch (err) {
      throw describeWaError(err, 'penambahan admin grup');
    }
  }

  /** Satu percobaan groupCreate per rentang ini — melindungi kuota WhatsApp dari klik beruntun. */
  private guardCooldown(): void {
    const remaining = this.lastCreateAttempt + GROUP_CREATE_COOLDOWN_MS - Date.now();
    if (remaining > 0) {
      throw new ConflictError(`Baru saja membuat grup. Coba lagi dalam ${Math.ceil(remaining / 1000)} detik.`);
    }
    this.lastCreateAttempt = Date.now();
  }

  /** Bentuk id bot yang sah (pn, suffix perangkat, LID); server balas `bad-request` bila bentuk ditolak, jadi ketiganya dicoba berurutan. */
  private participantForms(sock: any, botJid: string): string[] {
    const pn = normalizeWaNumber(bareNumber(botJid));
    const forms = [pn ? `${pn}@s.whatsapp.net` : null, botJid, sock?.user?.lid ?? null];
    return forms.filter((f): f is string => !!f).filter((f, i, all) => all.indexOf(f) === i);
  }

  /** Penggantian BENTUK JID (bukan percobaan acak): hanya `bad-request` yang dicoba ulang, tiap percobaan diberi jarak agar tidak jadi `rate-overlimit`. */
  private async createGroup(
    sock: any,
    subject: string,
    forms: string[],
    cohortId: string
  ): Promise<{ groupJid: string; form: string }> {
    let last = '';
    for (const form of forms) {
      try {
        const created = await sock.groupCreate(subject, [form]);
        const groupJid: string | undefined = created?.id;
        if (groupJid) return { groupJid, form };
        last = 'WhatsApp tidak mengembalikan identitas grup';
      } catch (err) {
        last = (err as Error)?.message ?? String(err);
        if (!/bad-request/i.test(last)) throw describeWaError(err, 'pembuatan grup');
      }
      logger.warn('WA: groupCreate ditolak server', { cohortId, participant: form, error: last });
      await sleep(GROUP_RETRY_DELAY_MS);
    }

    // Peserta kosong = WhatsApp yang mengisi pembuat. Beberapa akun menolak
    // bila daftar peserta berisi identitasnya sendiri.
    try {
      const created = await sock.groupCreate(subject, []);
      if (created?.id) return { groupJid: String(created.id), form: '(tanpa peserta)' };
      last = 'WhatsApp tidak mengembalikan identitas grup';
    } catch (err) {
      last = (err as Error)?.message ?? String(err);
    }
    logger.warn('WA: groupCreate tanpa peserta juga ditolak', { cohortId, error: last });

    throw new BadRequestError(
      `WhatsApp menolak pembuatan grup oleh akun ini (bad-request). ` +
        `Bentuk identitas yang dicoba: ${forms.join(', ')}, tanpa peserta. ` +
        `Alternatif: buat grupnya manual di HP bot, lalu tempel link undangannya di tombol "Gabung Grup".`
    );
  }

  /** Adopsi grup buatan manual lewat link undangan — jalur cadangan bila akun bot tidak diizinkan membuat grup. */
  async adoptFromInvite(cohortId: string, invite: string): Promise<WaGroup> {
    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    const code = String(invite).trim().split('/').filter(Boolean).pop() ?? '';
    if (code.length < 6) throw new BadRequestError('Link undangan tidak dikenali — contoh: https://chat.whatsapp.com/AbCdEfGhIjKl');

    const sock = waClient.requireSocket();
    const settings = await waSettings.getAll();

    let groupJid: string | undefined;
    try {
      groupJid = await sock.groupAcceptInvite(code);
    } catch (err) {
      throw describeWaError(err, 'bergabung ke grup lewat link');
    }
    if (!groupJid) throw new BadRequestError('WhatsApp tidak mengembalikan identitas grup — periksa link undangannya.');

    let subject = `PKL — ${cohort.name}`.slice(0, 75);
    try {
      const meta = await sock.groupMetadata(groupJid);
      if (meta?.subject) subject = String(meta.subject).slice(0, 75);
    } catch (err) {
      logger.warn('WA: subjek grup tidak terbaca, memakai nama gelombang', { cohortId, error: (err as Error).message });
    }

    await sleep(GROUP_ACTION_DELAY_MS);
    await this.safeGroupAction(() => sock.groupSettingUpdate(groupJid as string, 'announcement'), cohortId, 'kunci announcement');

    const botJid: string = sock.user?.id ?? '';
    await this.addAdmins(sock, groupJid, settings.groupAdmins, botJid, cohortId);

    const inviteUrl = `https://chat.whatsapp.com/${code}`;
    const existing = await prisma.waGroup.findUnique({ where: { cohortId } });
    const data = { jid: groupJid.slice(0, 60), subject, invite: inviteUrl };
    if (existing) {
      logger.info('WA: grup gelombang diadopsi ulang', { cohortId, jid: groupJid });
      return prisma.waGroup.update({ where: { id: existing.id }, data });
    }
    logger.info('WA: grup gelombang diadopsi dari link undangan', { cohortId, jid: groupJid });
    return prisma.waGroup.create({ data: { cohortId, ...data } });
  }

  /**
   * Masukkan + promosikan admin. Nomor diverifikasi lewat onWhatsApp lebih dulu
   * karena satu nomor tak terdaftar membuat seluruh operasi peserta ditolak.
   */
  private async addAdmins(
    sock: any,
    groupJid: string,
    numbers: string[],
    botJid: string,
    cohortId: string
  ): Promise<{ added: string[]; skipped: string[] }> {
    const botNumber = normalizeWaNumber(bareNumber(botJid));
    const candidates = dedupeNumbers(
      numbers.map((n) => normalizeWaNumber(n)).filter((n): n is string => n !== null)
    ).filter((n) => n !== botNumber);
    if (candidates.length === 0) return { added: [], skipped: [] };

    const { ok, skipped } = await this.filterRegistered(sock, candidates);
    if (skipped.length) {
      logger.warn('WA: nomor admin tidak terdaftar di WhatsApp, dilewati', { cohortId, skipped });
    }
    if (ok.length === 0) return { added: [], skipped };

    for (let i = 0; i < ok.length; i += PARTICIPANT_CHUNK) {
      const chunk = ok.slice(i, i + PARTICIPANT_CHUNK).map((n) => `${n}@s.whatsapp.net`);
      await this.safeGroupAction(() => sock.groupParticipantsUpdate(groupJid, chunk, 'add'), cohortId, 'tambah admin');
      await sleep(GROUP_ACTION_DELAY_MS);
      await this.safeGroupAction(() => sock.groupParticipantsUpdate(groupJid, chunk, 'make_admin'), cohortId, 'promosi admin');
      await sleep(GROUP_ACTION_DELAY_MS);
    }

    return { added: ok, skipped };
  }

  /** onWhatsApp menandai nomor tanpa akun dengan exists=false. */
  private async filterRegistered(sock: any, numbers: string[]): Promise<{ ok: string[]; skipped: string[] }> {
    try {
      const results: any[] = await sock.onWhatsApp(...numbers);
      const registered = new Set(
        (results ?? []).filter((r) => r?.exists !== false).map((r) => bareNumber(String(r?.jid ?? '')))
      );
      const ok: string[] = [];
      const skipped: string[] = [];
      for (const number of numbers) {
        (registered.has(number) ? ok : skipped).push(number);
      }
      return { ok, skipped };
    } catch (err) {
      // Verifikasi gagal (mis. sesi tidak mendukung usync) — jangan batalkan pembuatan grup.
      logger.warn('WA: verifikasi nomor admin gagal, semua nomor tetap dicoba', { error: (err as Error).message });
      return { ok: numbers, skipped: [] };
    }
  }

  /** Pesan pembuka; dikirim sekali saat grup dibuat — tanpa hidetag karena anggota belum ada yang masuk. */
  private introText(cohortName: string, invite: string | null, adminCount: number): string {
    return [
      `📣 *Grup Pengumuman PKL — ${cohortName}*`,
      '',
      'Grup ini *dikunci*: hanya admin yang bisa mengirim pesan. Siswa dan guru cukup membaca.',
      '',
      'Yang akan muncul di sini:',
      '• Notifikasi awal & batas akhir setiap fase PKL (lewat @semua)',
      '• Pengingat berkas, presensi, penilaian, dan laporan akhir',
      '• Perubahan jadwal atau pengumuman resmi sekolah',
      '',
      invite
        ? `Bagikan link ini ke siswa & guru pembimbing gelombang ${cohortName}:\n${invite}`
        : 'Link undangan akan dibagikan Admin menyusul (atau lewat web PKL).',
      '',
      adminCount > 0
        ? `${adminCount} admin sudah masuk sebagai pengelola grup.`
        : 'Belum ada admin grup — atur nomornya di menu Config agar pengumuman bisa dikirim.',
      '',
      'Butuh panduan? Chat nomor ini lalu tekan tombol peran Anda (Siswa / Guru / Admin). Bot hanya menjawab, tidak chat lebih dulu.',
    ].join('\n');
  }

  /** Gagal di sini tidak boleh membatalkan grup yang sudah jadi. */
  private async safeGroupAction(action: () => Promise<unknown>, cohortId: string, label: string): Promise<void> {
    try {
      await action();
    } catch (err) {
      logger.warn(`WA: operasi grup "${label}" gagal`, { cohortId, error: (err as Error).message });
    }
  }
}

export const waGroupService = new WaGroupService();
