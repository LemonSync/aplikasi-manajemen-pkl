/**
 * Penahan spam chat pribadi: begitu batas terlampaui bot berhenti mengirim teks
 * dan hanya menempelkan reaksi ⏳. Batas dihitung dari JUMLAH BALASAN yang sudah
 * terkirim ke chat itu (dibaca dari wa_message_logs oleh pemakai), jadi tetap
 * berlaku setelah restart backend dan tidak bisa dilewati proses bot lain yang
 * ikut terhubung ke nomor yang sama. Riwayat lokal di sini hanya pelindung
 * beberapa pesan yang masuk berdempetan sebelum baris log-nya terbaca.
 */

export interface SpamSettings {
  windowSec: number;
  maxPerWindow: number;
  cooldownSec: number;
}

export const SPAM_DEFAULTS: SpamSettings = { windowSec: 15, maxPerWindow: 5, cooldownSec: 45 };

/** Batas yang diterima UI/validator — nilai di luar ini dibuang, tidak dipakai diam-diam. */
export const SPAM_BOUNDS = {
  windowSec: { min: 5, max: 300 },
  maxPerWindow: { min: 1, max: 20 },
  cooldownSec: { min: 10, max: 600 },
} as const;

export const clampSpamSettings = (value: Partial<SpamSettings>): SpamSettings => {
  const clamp = (raw: number | undefined, { min, max }: { min: number; max: number }, fallback: number): number => {
    if (raw === undefined || !Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, Math.round(raw)));
  };
  return {
    windowSec: clamp(value.windowSec, SPAM_BOUNDS.windowSec, SPAM_DEFAULTS.windowSec),
    maxPerWindow: clamp(value.maxPerWindow, SPAM_BOUNDS.maxPerWindow, SPAM_DEFAULTS.maxPerWindow),
    cooldownSec: clamp(value.cooldownSec, SPAM_BOUNDS.cooldownSec, SPAM_DEFAULTS.cooldownSec),
  };
};

const STATE_TTL_MS = 10 * 60_000;
const MAX_STATES = 500;

export const COOLDOWN_REACTION = '⏳';

let limits: SpamSettings = { ...SPAM_DEFAULTS };

/** Terapkan batas terbaru (dipanggil saat boot dan setiap pengaturan bot disimpan). */
export const configureAntiSpam = (next: SpamSettings): void => {
  limits = clampSpamSettings(next);
};

/** Lebar jendela hitung aktif — dipakai pemakai untuk menghitung balasan dari log. */
export const spamWindowMs = (): number => limits.windowSec * 1000;

interface ChatState {
  /** waktu balasan yang baru dikirim proses ini */
  hits: number[];
  blockedUntil: number;
  lastReact: number;
  at: number;
}

const states = new Map<string, ChatState>();

const prune = (now: number): void => {
  for (const [jid, state] of states) {
    if (now - state.at <= STATE_TTL_MS) continue;
    states.delete(jid);
  }
  while (states.size > MAX_STATES) {
    const oldest = states.keys().next().value;
    if (oldest === undefined) break;
    states.delete(oldest);
  }
};

const stateFor = (jid: string, now: number): ChatState => {
  const state = states.get(jid) ?? { hits: [], blockedUntil: 0, lastReact: 0, at: now };
  state.at = now;
  states.set(jid, state);
  return state;
};

/**
 * `true` = boleh menjawab. `sentInWindow` = jumlah balasan chat ini menurut log,
 * atau -1 bila log tidak bisa dibaca (maka hanya riwayat lokal yang menahan).
 */
export const allowReply = (jid: string, sentInWindow = -1): boolean => {
  const now = Date.now();
  prune(now);
  const state = stateFor(jid, now);

  if (now < state.blockedUntil) return false;

  const windowMs = limits.windowSec * 1000;
  state.hits = state.hits.filter((t) => now - t < windowMs);
  if (Math.max(state.hits.length, sentInWindow) >= limits.maxPerWindow) {
    state.blockedUntil = now + limits.cooldownSec * 1000;
    return false;
  }

  state.hits.push(now);
  return true;
};

/** Sekali per masa tahan — reaksi ⏳ tidak boleh berubah jadi spam emoji. */
export const claimReact = (jid: string): boolean => {
  const now = Date.now();
  const state = stateFor(jid, now);
  const intervalMs = Math.min(limits.cooldownSec, limits.windowSec) * 1000;
  if (now - state.lastReact < intervalMs) return false;
  state.lastReact = now;
  return true;
};
