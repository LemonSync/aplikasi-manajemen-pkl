import { systemSettingRepository } from '../../repositories/setting.repository';
import { settingService } from '../setting.service';
import { clampSpamSettings, configureAntiSpam, SPAM_DEFAULTS, type SpamSettings } from './waAntiSpam';
import { dedupeNumbers, normalizeWaNumber } from './waNumber';

/**
 * Pengaturan bot WhatsApp — disimpan di SystemSetting (key `wa.*`) supaya
 * audit, UI Config, dan pola baca bertipe yang sudah ada bisa dipakai ulang.
 */
export const WA_KEYS = {
  enabled: 'wa.enabled',
  botNumber: 'wa.bot.number',
  welcome: 'wa.welcome.text',
  csContact: 'wa.cs.contact',
  groupEnabled: 'wa.group.enabled',
  groupAdmins: 'wa.group.admins',
  reminderEnabled: 'wa.reminder.enabled',
  retentionDays: 'wa.log.retentionDays',
  spamWindowSec: 'wa.spam.windowSec',
  spamMaxPerWindow: 'wa.spam.maxPerWindow',
  spamCooldownSec: 'wa.spam.cooldownSec',
} as const;

export interface WaSettings {
  enabled: boolean;
  botNumber: string | null;
  welcomeText: string;
  csContact: string;
  groupEnabled: boolean;
  /** Nomor admin yang ikut dimasukkan & dipromosikan saat grup dibuat. */
  groupAdmins: string[];
  reminderEnabled: boolean;
  retentionDays: number;
  /** Batas penahan spam chat pribadi. */
  spam: SpamSettings;
}

export const WA_DEFAULTS: WaSettings = {
  enabled: false,
  botNumber: null,
  welcomeText:
    'Halo 👋 Saya *bot panduan Sistem Manajemen PKL*.\n' +
    'Saya hanya menjawab pesan yang masuk ke nomor ini — tidak pernah chat lebih dulu, dan tidak menanyakan data pribadi.\n\n' +
    'Tekan tombol di bawah untuk memilih peran, ketik *menu* kapan saja untuk kembali, atau *admin* bila ingin bicara dengan petugas.',
  csContact: '',
  groupEnabled: true,
  groupAdmins: [],
  reminderEnabled: true,
  retentionDays: 30,
  spam: { ...SPAM_DEFAULTS },
};

/** Description tiap key — dipakai saat menulis SystemSetting baru. */
const KEY_DESCRIPTIONS: Record<string, string> = {
  [WA_KEYS.enabled]: 'Bot WhatsApp aktif (butuh WA_ENABLED=true di server)',
  [WA_KEYS.botNumber]: 'Nomor WhatsApp bot yang sedang terhubung (diisi otomatis)',
  [WA_KEYS.welcome]: 'Teks pembuka saat user memulai chat',
  [WA_KEYS.csContact]: 'Kontak admin untuk tombol Hubungi Admin',
  [WA_KEYS.groupEnabled]: 'Buat grup pengumuman otomatis saat gelombang ditambahkan',
  [WA_KEYS.groupAdmins]: 'Daftar nomor admin yang dipromosikan di grup gelombang',
  [WA_KEYS.reminderEnabled]: 'Kirim pengingat perpindahan fase ke grup',
  [WA_KEYS.retentionDays]: 'Umur simpan log percakapan customer service (hari)',
  [WA_KEYS.spamWindowSec]: 'Jendela hitung spam chat pribadi (detik)',
  [WA_KEYS.spamMaxPerWindow]: 'Jumlah balasan bot yang boleh dikirim dalam satu jendela hitung',
  [WA_KEYS.spamCooldownSec]: 'Lama balasan ditahan setelah jendela terlampaui (detik)',
};

export class WaSettingsService {
  async getAll(): Promise<WaSettings> {
    const [enabled, botNumber, welcome, csContact, groupEnabled, groupAdminsRaw, reminderEnabled, retention, spamWindow, spamMax, spamCooldown] =
      await Promise.all([
        settingService.getBoolean(WA_KEYS.enabled, WA_DEFAULTS.enabled),
        settingService.get(WA_KEYS.botNumber),
        settingService.get(WA_KEYS.welcome),
        settingService.get(WA_KEYS.csContact),
        settingService.getBoolean(WA_KEYS.groupEnabled, WA_DEFAULTS.groupEnabled),
        settingService.get(WA_KEYS.groupAdmins),
        settingService.getBoolean(WA_KEYS.reminderEnabled, WA_DEFAULTS.reminderEnabled),
        settingService.getNumber(WA_KEYS.retentionDays, WA_DEFAULTS.retentionDays),
        settingService.getNumber(WA_KEYS.spamWindowSec, SPAM_DEFAULTS.windowSec),
        settingService.getNumber(WA_KEYS.spamMaxPerWindow, SPAM_DEFAULTS.maxPerWindow),
        settingService.getNumber(WA_KEYS.spamCooldownSec, SPAM_DEFAULTS.cooldownSec),
      ]);

    return {
      enabled,
      botNumber: botNumber?.trim() || null,
      welcomeText: welcome?.trim() || WA_DEFAULTS.welcomeText,
      csContact: csContact?.trim() || '',
      groupEnabled,
      groupAdmins: this.parseAdmins(groupAdminsRaw),
      reminderEnabled,
      retentionDays: retention > 0 ? Math.min(retention, 365) : WA_DEFAULTS.retentionDays,
      spam: clampSpamSettings({ windowSec: spamWindow, maxPerWindow: spamMax, cooldownSec: spamCooldown }),
    };
  }

  /** Simpan sebagian (hanya key yang dikirim). Nilai normalisasi ke string tersimpan. */
  async update(
    patch: Partial<Omit<WaSettings, 'botNumber'>> & { botNumber?: string | null },
    actorId?: string
  ): Promise<WaSettings> {
    const writes: Array<Promise<unknown>> = [];

    const put = (key: string, value: string, type: string): void => {
      writes.push(
        systemSettingRepository.upsert(key, {
          value,
          type,
          description: KEY_DESCRIPTIONS[key] ?? null,
          updatedById: actorId ?? null,
        })
      );
    };

    if (patch.enabled !== undefined) put(WA_KEYS.enabled, String(patch.enabled), 'boolean');
    if (patch.groupEnabled !== undefined) put(WA_KEYS.groupEnabled, String(patch.groupEnabled), 'boolean');
    if (patch.reminderEnabled !== undefined) put(WA_KEYS.reminderEnabled, String(patch.reminderEnabled), 'boolean');
    if (patch.welcomeText !== undefined) put(WA_KEYS.welcome, patch.welcomeText.trim(), 'string');
    if (patch.csContact !== undefined) put(WA_KEYS.csContact, patch.csContact.trim(), 'string');
    if (patch.retentionDays !== undefined) put(WA_KEYS.retentionDays, String(patch.retentionDays), 'number');
    if (patch.groupAdmins !== undefined) put(WA_KEYS.groupAdmins, JSON.stringify(patch.groupAdmins), 'json');
    if (patch.botNumber !== undefined) put(WA_KEYS.botNumber, patch.botNumber ?? '', 'string');
    if (patch.spam !== undefined) {
      const spam = clampSpamSettings(patch.spam);
      put(WA_KEYS.spamWindowSec, String(spam.windowSec), 'number');
      put(WA_KEYS.spamMaxPerWindow, String(spam.maxPerWindow), 'number');
      put(WA_KEYS.spamCooldownSec, String(spam.cooldownSec), 'number');
    }

    await Promise.all(writes);
    const saved = await this.getAll();
    configureAntiSpam(saved.spam);
    return saved;
  }

  /** Nomor admin yang tersimpan; yang tidak valid dibuang sejak dibaca. */
  parseAdmins(raw: string | null): string[] {
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return dedupeNumbers(parsed.map((value) => normalizeWaNumber(value)).filter((v): v is string => v !== null)).slice(0, 20);
  }
}

export const waSettings = new WaSettingsService();
