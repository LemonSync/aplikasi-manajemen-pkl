import fs from 'fs';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { BadRequestError } from '../../errors/AppError';
import { ensureDir } from '../../utils/storage';
import { loadBaileys } from './waLoader';
import { requireWaNumber } from './waNumber';
import { waSettings } from './waSettings';

export type WaConnectionState = 'idle' | 'connecting' | 'qr' | 'connected';

/** Handler pesan masuk; dipasang oleh runtime agar waClient tidak mengimpor layanan lain. */
export type WaInboundHandler = (sock: any, messages: any[]) => Promise<void>;

export interface WaStatus {
  state: WaConnectionState;
  botJid: string | null;
  botName: string | null;
  /** QR (PNG data URL) selama mode scan; null bila sudah terhubung / tidak ada QR baru. */
  qr: string | null;
  lastError: string | null;
  since: string | null;
}

const RECONNECT_DELAY_MS = 5_000;
/** Percobaan ulang berturut-turut sebelum bot berhenti sendiri (hindari loop tanpa ujung). */
const MAX_RECONNECT_FAILURES = 5;
const PAIRING_READY_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Manajemen satu koneksi Baileys in-process.
 * Callback event dibungkus try/catch: satu exception dari socket menjatuhkan
 * seluruh backend (`uncaughtException -> process.exit(1)`).
 */
export class WaClient {
  private sock: any = null;
  private state: WaConnectionState = 'idle';
  private qr: string | null = null;
  private lastError: string | null = null;
  private since: string | null = null;
  private botJid: string | null = null;
  private botName: string | null = null;
  private failures = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private inbound: WaInboundHandler | null = null;
  /** true sesudah admin menekan Stop/Logout — close yang datang setelah itu bukan kegagalan. */
  private stopped = false;
  /** DisconnectReason.loggedOut dari modul Baileys (diisi saat koneksi dibuat). */
  private loggedOutCode: number | null = null;

  setInboundHandler(handler: WaInboundHandler | null): void {
    this.inbound = handler;
  }

  getStatus(): WaStatus {
    return {
      state: this.state,
      botJid: this.botJid,
      botName: this.botName,
      qr: this.qr,
      lastError: this.lastError,
      since: this.since,
    };
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.sock !== null;
  }

  requireSocket(): any {
    if (!this.sock || this.state !== 'connected') {
      throw new BadRequestError('Bot WhatsApp belum terhubung. Hubungkan dulu di menu Config.');
    }
    return this.sock;
  }

  /** Jalankan sekali per proses: idempoten, dan menolak dobel koneksi. */
  async start(): Promise<WaStatus> {
    if (this.sock || this.reconnectTimer) return this.getStatus();
    this.stopped = false;
    this.failures = 0;
    await this.connect();
    return this.getStatus();
  }

  async stop(): Promise<WaStatus> {
    this.stopped = true;
    this.clearReconnectTimer();
    this.teardown();
    this.state = 'idle';
    this.since = new Date().toISOString();
    logger.info('WA: koneksi dihentikan manual');
    return this.getStatus();
  }

  /** Putus sesi lalu kosongkan folder auth; tanpa ini, start() login lagi sebagai perangkat yang sama. */
  async logout(): Promise<WaStatus> {
    const sock = this.sock;
    this.stopped = true;
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        logger.warn('WA: logout gagal, sesi tetap dihapus dari disk', { error: (err as Error).message });
      }
    }
    this.clearReconnectTimer();
    this.teardown();
    this.clearAuthFiles();
    this.state = 'idle';
    this.botJid = null;
    this.botName = null;
    this.since = new Date().toISOString();
    void waSettings.update({ botNumber: null }).catch((e: Error) => logger.warn('WA: gagal bersihkan wa.bot.number', { error: e.message }));
    logger.info('WA: sesi keluar (logout) dan kredensial lokal dihapus');
    return this.getStatus();
  }

  /** Kode pairing 8 karakter untuk menautkan nomor tanpa scan QR. */
  async requestPairingCode(rawNumber: string): Promise<string> {
    if (this.state === 'connected') throw new BadRequestError('Bot sudah terhubung dengan sesi aktif.');
    const number = requireWaNumber(rawNumber);

    if (!this.sock) await this.start();
    await this.waitPairingReady();
    if (!this.sock) throw new BadRequestError('Koneksi bot gagal dimulai, coba lagi.');

    try {
      return String(await this.sock.requestPairingCode(number));
    } catch (err) {
      throw new BadRequestError(
        `Gagal meminta kode pairing: ${(err as Error).message}. ` +
          'Kalau nomor ini masih dipakai bot di server lain, matikan bot itu dahulu lalu ulangi.'
      );
    }
  }

  /** Dipanggil saat proses dimatikan (SIGINT/SIGTERM). */
  async destroy(): Promise<void> {
    this.stopped = true;
    this.clearReconnectTimer();
    this.teardown();
  }

  private async connect(): Promise<void> {
    this.state = 'connecting';
    this.since = new Date().toISOString();
    try {
      const baileys = await loadBaileys();
      ensureDir(env.waAuthDir);

      const { state: authState, saveCreds } = await baileys.useMultiFileAuthState(env.waAuthDir);

      // Ambil versi WA terbaru; jaringan terbatas bukan alasan bot tidak bisa dimulai.
      let version: [number, number, number] | undefined;
      try {
        version = (await baileys.fetchLatestBaileysVersion()).version;
      } catch (err) {
        logger.warn('WA: versi WA terbaru tidak dapat diambil, memakai bawaan Baileys', {
          error: (err as Error).message,
        });
      }

      this.loggedOutCode = baileys.DisconnectReason?.loggedOut ?? null;

      const sock = baileys.default({
        version,
        auth: authState,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Sistem PKL', 'Chrome', '20.0.04'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });
      this.sock = sock;

      sock.ev.on('creds.update', () => {
        void saveCreds().catch((err: Error) => logger.error('WA: gagal simpan kredensial', { error: err.message }));
      });

      sock.ev.on('connection.update', (update: any) => {
        void this.onConnectionUpdate(update).catch((err: Error) =>
          logger.error('WA: penanganan connection.update gagal', { error: err.message })
        );
      });

      sock.ev.on('messages.upsert', ({ type, messages }: any) => {
        if (type !== 'notify' || !Array.isArray(messages)) return;
        const handler = this.inbound;
        if (!handler) return;
        void handler(sock, messages).catch((err: Error) =>
          logger.error('WA: penanganan pesan masuk gagal', { error: err.message })
        );
      });

      logger.info('WA: koneksi Baileys dimulai', { authDir: env.waAuthDir });
    } catch (err) {
      this.onConnectFailure(err as Error);
    }
  }

  /**
   * QR pertama hanya dikirim server setelah handshake berhasil, jadi state 'qr'
   * adalah satu-satunya sinyal "socket siap". Meminta kode pairing sebelumnya selalu
   * berujung `Connection Closed`.
   */
  private async waitPairingReady(timeoutMs = PAIRING_READY_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.state === 'connected') throw new BadRequestError('Bot sudah terhubung dengan sesi aktif.');
      if (this.sock && this.state === 'qr') return;
      if (!this.sock && this.state !== 'connecting') break;
      await sleep(200);
    }
    throw new BadRequestError(
      `Server WhatsApp belum siap menautkan perangkat dalam ${Math.round(timeoutMs / 1000)} detik. ` +
        (this.lastError ? `Kesalahan terakhir: ${this.lastError}. ` : '') +
        'Pastikan bot di server lain sudah benar-benar mati, lalu klik "Kirim Kode" lagi.'
    );
  }

  private async onConnectionUpdate(update: any): Promise<void> {
    if (update.qr) {
      this.qr = await QRCode.toDataURL(update.qr, { margin: 1 });
      this.state = 'qr';
      this.since = new Date().toISOString();
      logger.info('WA: QR siap discan');
      return;
    }

    if (update.connection === 'open') {
      this.qr = null;
      this.failures = 0;
      this.state = 'connected';
      this.since = new Date().toISOString();
      this.botJid = this.sock?.user?.id ?? null;
      this.botName = this.sock?.user?.name ?? null;
      logger.info('WA: terhubung', { jid: this.botJid });
      const number = this.botJid?.split('@')[0] ?? null;
      void waSettings.update({ botNumber: number }).catch((e: Error) =>
        logger.warn('WA: gagal menyimpan wa.bot.number', { error: e.message })
      );
      return;
    }

    if (update.connection === 'close') {
      const statusCode = update.lastDisconnect?.error?.output?.statusCode;
      const loggedOut = this.loggedOutCode !== null && statusCode === this.loggedOutCode;
      this.teardown();
      if (this.stopped) {
        logger.info('WA: koneksi ditutup setelah penghentian manual');
        return;
      }
      if (loggedOut) {
        // Sesi di disk sudah ditolak WhatsApp (perangkat dilepas dari HP, atau bad-session 401
        // yang Baileys laporkan sebagai loggedOut). Dibiarkan => loop connect -> logout tanpa ujung
        // dan kode pairing tidak akan pernah bisa diminta lagi.
        this.qr = null;
        this.botJid = null;
        this.botName = null;
        this.since = new Date().toISOString();
        this.clearAuthFiles();
        this.failures += 1;
        if (this.failures >= MAX_RECONNECT_FAILURES) {
          this.state = 'idle';
          this.lastError = 'Sesi WhatsApp ditolak berkali-kali. Hapus sesi lewat Config lalu tautkan ulang perangkat.';
          logger.error('WA: sesi ditolak berulang kali — berhenti');
          return;
        }
        this.lastError = 'Sesi lama ditolak WhatsApp, kredensial lokal dibersihkan — menyambung ulang untuk mendapatkan QR/kode pairing baru.';
        logger.warn('WA: sesi ditolak — kredensial lokal dibersihkan, koneksi baru dijadwalkan', { attempt: this.failures });
        this.armReconnect(1_500);
        return;
      }
      this.onConnectFailure(new Error(`koneksi ditutup (statusCode ${statusCode ?? 'tanpa kode'})`));
    }
  }

  private onConnectFailure(err: Error): void {
    this.lastError = err.message;
    this.teardown();
    this.failures += 1;
    if (this.failures >= MAX_RECONNECT_FAILURES) {
      this.state = 'idle';
      logger.error('WA: berhenti setelah beberapa kali gagal menyambung', { error: err.message });
      return;
    }
    logger.warn('WA: menyambung ulang dijadwalkan', {
      error: err.message,
      attempt: this.failures,
      delayMs: RECONNECT_DELAY_MS,
    });
    this.armReconnect();
  }

  /** Jadwalkan satu connect() ulang; kegagalan dihitung di pemanggil, tidak di sini. */
  private armReconnect(delayMs = RECONNECT_DELAY_MS): void {
    this.clearReconnectTimer();
    this.state = 'connecting';
    this.since = new Date().toISOString();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);
  }

  private teardown(): void {
    const sock = this.sock;
    this.sock = null;
    this.qr = null;
    if (!sock) return;
    try {
      sock.end(new Error('Bot dihentikan dari aplikasi'));
    } catch {
      // socket sudah mati — abaikan
    }
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /** Hanya boleh menghapus isi folder auth bot — tidak pernah path lain. */
  private clearAuthFiles(): void {
    const dir = path.resolve(env.waAuthDir);
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const target = path.join(dir, entry);
      if (!target.startsWith(`${dir}${path.sep}`)) continue;
      try {
        if (fs.statSync(target).isDirectory()) fs.rmSync(target, { recursive: true, force: true });
        else fs.unlinkSync(target);
      } catch (err) {
        logger.warn('WA: gagal menghapus berkas auth', { file: entry, error: (err as Error).message });
      }
    }
  }
}

export const waClient = new WaClient();
