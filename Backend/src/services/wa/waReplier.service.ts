import type { WaGuide } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { readStoredFile } from '../../utils/storage';
import { waSettings } from './waSettings';
import { waLog } from './waLog.service';
import { sendButtons, sendImage, sendReact, sendText, type ListRow, type WaButton } from './waSend';
import { allowReply, claimReact, COOLDOWN_REACTION, spamWindowMs } from './waAntiSpam';

/** Baris/tombol khusus (tanpa baris DB) untuk menghubungi admin dan kembali ke menu. */
export const CONTACT_ROW_ID = 'kontak-admin';
export const MENU_ROW_ID = 'menu';

const CONTACT_ROW: ListRow = { rowId: CONTACT_ROW_ID, title: 'Hubungi Admin' };

/** Lebih dari tiga tombol inline tampilannya jadi berantakan di layar HP. */
const MAX_INLINE_BUTTONS = 3;
/** Teks tombol dipotong WhatsApp sekitar 30 karakter. */
const BUTTON_TEXT_MAX = 26;
/** Pesan tombol boleh dua; lebih dari itu layar jadi penuh, pindah ke daftar bernomor. */
const MAX_BUTTON_MESSAGES = 2;

/** URL web hanya berguna bila benar-benar bisa dibuka dari HP. */
const publicWebUrl = (): string | null => {
  const url = env.FRONTEND_URL ?? '';
  if (!url || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) return null;
  return url;
};

const COPY = {
  menuHeading: 'Anda Siswa, Guru Pembimbing, atau Admin?',
  menuHint: 'Tekan salah satu tombol untuk mulai. Semua panduan mengacu ke web Sistem Manajemen PKL.',
  topicHint: 'Bot akan mengirim langkah-langkahnya, lengkap dengan gambar bila tersedia.',
  thanks: 'Sama-sama 🙏 Semoga PKL-nya lancar. Ketik *menu* kalau butuh panduan lain.',
  bye: 'Siap, sampai jumpa 👋 Ketik *menu* bila nanti butuh bantuan lagi.',
  unknown: 'Maaf, pertanyaan itu belum ada di panduan saya 🙏\nPilih topik lewat tombol di bawah ya.',
  emptyTree:
    'Panduan belum tersedia saat ini — admin sedang menyusunnya.\nUntuk sementara, hubungi petugas PKL di sekolah atau cek menu *Pengumuman* pada web Sistem Manajemen PKL.',
  leafFooter: 'Masih bingung? Ketik *menu* untuk panduan lain, atau *admin* untuk menghubungi petugas.',
  contactHeader: '*Kontak Admin PKL*',
  contactTail: 'Sampaikan nama lengkap, kelas/jurusan, dan kendala Anda supaya cepat dibantu.',
  contactMissing:
    'Kontak admin belum tersedia saat ini. Coba lagi beberapa saat, atau cek menu *Pengumuman* pada web Sistem Manajemen PKL.',
  replyFailed: 'Maaf, balasan saya tadi gagal terkirim 🙏\nCoba ketik *menu* sekali lagi ya.',
  numberedHint: 'Balas *angkanya saja* (mis. 1), atau ketik *menu* untuk kembali.',
  moreOptions: 'Pilihan lainnya',
  contactHint: 'Ketik "admin" untuk menghubungi petugas',
} as const;

/** Batas umur pilihan yang diingat — sesudah ini angka tidak lagi diterjemahkan. */
const CHOICE_TTL_MS = 30 * 60 * 1000;
/** Jangan biarkan memori percakapan tumbuh tanpa batas. */
const CHOICE_MEMORY_MAX = 300;

/** Normalisasi teks bebas untuk pencocokan label/keyword: huruf kecil, alnum saja. */
const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Keyword → maksud. Pencocokan dilakukan pada teks yang sudah di-slug. */
const INTENT_WORDS: Record<'menu' | 'contact' | 'thanks' | 'bye' | 'greeting', string[]> = {
  menu: ['menu', 'kembali', 'awal', 'main', 'home', 'start', 'pilihan', 'daftarpanduan', 'panduan', 'help', 'bantuan'],
  contact: ['admin', 'kontak', 'hubungi', 'petugas', 'cs', 'sambungkan', 'manusia', 'operator'],
  thanks: ['makasih', 'terimakasih', 'trimakasih', 'thanks', 'thankyou', 'thx'],
  bye: ['dada', 'daduh', 'bye', 'sampaijumpa', 'assalamuallaikumwarahmatullahi', 'selesai', 'cukup'],
  greeting: ['halo', 'hai', 'hi', 'hey', 'hallo', 'selamatpagi', 'selamatsiang', 'selamatsore', 'selamatmalam', 'assalamuallaikum', 'apa kabar', 'p', 'info'],
};

const detectIntent = (text: string): keyof typeof INTENT_WORDS | null => {
  const value = slug(text);
  if (!value) return null;
  if (value === 'assalamuallaikum' || value === 'assalamualaikum' || value === 'assalamuallaikum warahmatullah') return 'greeting';
  for (const [intent, words] of Object.entries(INTENT_WORDS) as Array<[keyof typeof INTENT_WORDS, string[]]>) {
    if (words.includes(value)) return intent;
    if (value.split(' ').some((word) => words.includes(word)) && value.split(' ').length <= 3) return intent;
  }
  return null;
};

/**
 * Ambil id pilihan dari JSON balasan nativeFlow. Bentuknya berbeda-beda per
 * versi WhatsApp (`button_reply.id`, `list_reply.id`,
 * `single_select_reply.selected_item_id`, kadangungkus `message.interaction`),
 * jadi setelah jalur eksplisit kita telusuri seluruh pohonnya.
 */
const REPLY_ID_KEYS = ['selected_item_id', 'selectedItem', 'selectedRowId', 'rowId', 'button_id', 'id'];

const pickReplyValue = (node: any, keys: string[], depth = 0): string | null => {
  if (depth > 6 || node === null || typeof node !== 'object') return null;
  for (const key of keys) {
    const value = node[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const value of Object.values(node)) {
    const found = pickReplyValue(value, keys, depth + 1);
    if (found) return found;
  }
  return null;
};

const pickReplyText = (parsed: any): string | null =>
  pickReplyValue(parsed, ['display_text', 'title'], 0);

const extractNativeFlowReply = (raw: string): string | null => {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; /* payload terenkripsi/tidak berbentuk JSON — abaikan */
  }
  const explicit =
    parsed?.button_reply?.id ??
    parsed?.list_reply?.id ??
    parsed?.single_select_reply?.selected_item_id ??
    parsed?.single_select_reply?.selectedItem?.id ??
    parsed?.id;
  const value = typeof explicit === 'string' && explicit.trim() ? explicit.trim() : pickReplyValue(parsed, REPLY_ID_KEYS);
  if (value && !/^\s*<[?a-z]/i.test(value)) return value;
  const title = pickReplyText(parsed);
  return title ?? null;
};

/**
 * Ambil "isi" pesan yang relevan bagi bot, termasuk balasan tombol/daftar.
 * `selectedRowId` dan `button_reply.id` dikirim WhatsApp sebagai teks/JSON polos
 * sehingga bisa dibaca; klik yang hanya membawa teks tampilan tetap kita pakai
 * sebagai pencocokan label.
 */
export const extractInboundText = (message: any): { text: string; kind: string } => {
  if (!message) return { text: '', kind: 'unknown' };
  if (message.conversation) return { text: message.conversation, kind: 'text' };
  if (message.extendedTextMessage?.text) return { text: message.extendedTextMessage.text, kind: 'text' };
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return { text: message.listResponseMessage.singleSelectReply.selectedRowId, kind: 'list-response' };
  }
  if (message.buttonsResponseMessage?.selectedButtonId) {
    return { text: message.buttonsResponseMessage.selectedButtonId, kind: 'button-response' };
  }
  if (message.templateButtonReplyMessage?.selectedId) {
    return { text: message.templateButtonReplyMessage.selectedId, kind: 'button-response' };
  }

  const reply = message.interactiveResponseMessage;
  if (reply) {
    const direct = reply.buttonReply?.id ?? reply.listReply?.id ?? reply.singleSelectReply?.selectedItem?.id;
    if (direct) return { text: String(direct), kind: 'button-response' };

    for (const raw of [reply.nativeFlowResponseMessage?.paramsJson, reply.messagePayload]) {
      if (typeof raw !== 'string' || !raw) continue;
      const value = extractNativeFlowReply(raw);
      if (value) return { text: value, kind: 'button-response' };
    }
    const body = reply.body?.text;
    if (body) return { text: String(body), kind: 'button-response' };
  }

  for (const key of ['imageMessage', 'videoMessage', 'documentMessage']) {
    const caption = message[`${key}Caption`] ?? message[key]?.caption;
    if (caption) return { text: caption, kind: key };
  }
  return { text: '', kind: 'other' };
};

/**
 * Mesin customer service: hanya membalas pesan masuk di chat pribadi.
 * Bot tidak pernah memulai percakapan — satu-satunya kanal keluar aktif adalah grup.
 */
export class WaReplierService {
  /** Pilihan terakhir per chat — supaya balasan angka ("1", "2") bisa dipakai. */
  private readonly lastChoices = new Map<string, { rowIds: string[]; at: number }>();

  /** Entry point dari event `messages.upsert`. */
  async handle(sock: any, messages: any[]): Promise<void> {
    for (const msg of messages) {
      const jid: string = msg?.key?.remoteJid ?? '';
      if (!jid || msg?.key?.fromMe) continue;
      if (jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;

      const { text, kind } = extractInboundText(msg?.message);
      await waLog.record('IN', jid, msg?.key?.participant ?? jid, kind, text || null);

      // Batas dihitung dari balasan yang sudah terkirim (bukan dari pesan yang
      // masuk): satu klik bisa menghasilkan 2-3 pesan keluar, dan hitungan dari log
      // tetap berlaku walau backend restart atau ada proses bot lain yang terhubung.
      const sent = await waLog.sentInWindow(jid, spamWindowMs());
      if (!allowReply(jid, sent)) {
        await this.markCooldown(sock, jid, msg?.key);
        continue;
      }

      try {
        await this.reply(sock, jid, text, kind);
      } catch (err) {
        const reason = (err as Error)?.message ?? String(err);
        logger.error('WA: gagal membalas chat pribadi', { jid, error: reason });
        await waLog.record('OUT', jid, null, 'error', `balasan gagal: ${reason.slice(0, 200)}`).catch(() => undefined);
        await sendText(sock, jid, COPY.replyFailed).catch(() => undefined);
      }
    }
  }

  private async reply(sock: any, jid: string, rawText: string, kind = 'text'): Promise<void> {
    let input = rawText.trim();

    if (!input) {
      await this.renderEntry(sock, jid);
      return;
    }
    input = this.resolveChoice(jid, input) ?? input;

    if (input === MENU_ROW_ID) {
      await this.renderEntry(sock, jid);
      return;
    }
    if (input === CONTACT_ROW_ID) {
      await this.sendContact(sock, jid);
      return;
    }

    // RowId/label dicocokkan sebelum kata kunci: "peran-admin" memuat kata "admin",
    // kalau maksud diperiksa lebih dahulu tekanan tombol berubah jadi kontak.
    const guide = await this.findGuide(input);
    if (guide) {
      await this.renderNode(sock, jid, guide);
      return;
    }

    // Ketikan tombol yang tidak dikenali -> tawarkan menu, bukan kata "tidak paham".
    if (kind !== 'text') {
      await this.renderEntry(sock, jid, { unknown: true });
      return;
    }

    const intent = detectIntent(input);
    if (intent === 'thanks' || intent === 'bye') {
      await this.sendOut(sock, jid, intent === 'thanks' ? COPY.thanks : COPY.bye, `intent:${intent}`);
      return;
    }
    if (intent === 'contact') {
      await this.sendContact(sock, jid);
      return;
    }
    if (intent === 'greeting' || intent === 'menu') {
      await this.renderEntry(sock, jid);
      return;
    }

    await this.renderEntry(sock, jid, { unknown: true });
  }

  /** "2" → rowId opsi kedua dari daftar terakhir chat ini (selama belum kedaluwarsa). */
  private resolveChoice(jid: string, input: string): string | null {
    if (!/^\d{1,2}$/.test(input)) return null;
    const remembered = this.lastChoices.get(jid);
    if (!remembered || Date.now() - remembered.at > CHOICE_TTL_MS) {
      this.lastChoices.delete(jid);
      return null;
    }
    return remembered.rowIds[Number(input) - 1] ?? null;
  }

  private rememberChoices(jid: string, rows: ListRow[]): void {
    this.lastChoices.delete(jid);
    this.lastChoices.set(jid, { rowIds: rows.map((r) => r.rowId), at: Date.now() });
    while (this.lastChoices.size > CHOICE_MEMORY_MAX) {
      const oldest = this.lastChoices.keys().next().value;
      if (oldest === undefined) break;
      this.lastChoices.delete(oldest);
    }
  }

  /** rowId dulu (presisi), lalu pencocokan label/keyword di antara node aktif. */
  private async findGuide(input: string): Promise<WaGuide | null> {
    const exact = await prisma.waGuide.findUnique({ where: { rowId: input.slice(0, 60) } });
    if (exact?.isActive) return exact;

    const wanted = slug(input);
    if (!wanted) return null;
    const candidates = await prisma.waGuide.findMany({ where: { isActive: true } });
    return candidates.find((g) => slug(g.label) === wanted || slug(g.rowId) === wanted) ?? null;
  }

  /** Menu awal: sapaan (text) + pilihan peran (root node). */
  private async renderEntry(sock: any, jid: string, opts: { unknown?: boolean } = {}): Promise<void> {
    const [roots, settings] = await Promise.all([
      prisma.waGuide.findMany({ where: { isActive: true, parentId: null }, orderBy: { order: 'asc' } }),
      waSettings.getAll(),
    ]);

    const lead = opts.unknown ? COPY.unknown : settings.welcomeText;
    if (roots.length === 0) {
      await this.sendOut(sock, jid, opts.unknown ? `${COPY.unknown}\n\n${COPY.emptyTree}` : COPY.emptyTree, 'entry-empty');
      return;
    }

    await this.sendOut(sock, jid, `${lead}\n\n${COPY.menuHint}`, opts.unknown ? 'unknown' : 'welcome');
    await this.renderChoices(sock, jid, {
      heading: COPY.menuHeading,
      rows: this.toRows(roots),
      contact: settings.csContact ? CONTACT_ROW : null,
    });
  }

  /** Render satu node: cabang -> daftar anak, daun -> teks (+ gambar panduan). */
  private async renderNode(sock: any, jid: string, guide: WaGuide): Promise<void> {
    const children = await prisma.waGuide.findMany({
      where: { isActive: true, parentId: guide.id },
      orderBy: { order: 'asc' },
    });

    if (children.length > 0) {
      const { csContact } = await waSettings.getAll();
      await this.renderChoices(sock, jid, {
        heading: guide.label.slice(0, 72),
        hint: (guide.body ?? COPY.topicHint).slice(0, 900),
        rows: this.toRows(children),
        contact: csContact ? CONTACT_ROW : null,
      });
      return;
    }

    const caption = `${(guide.body ?? guide.label).slice(0, 1500)}\n\n_${COPY.leafFooter}_`;
    const image = guide.imagePath ? readStoredFile(guide.imagePath) : null;
    if (guide.imagePath && !image) {
      logger.warn('WA: gambar panduan tidak ditemukan, kirim teks saja', { rowId: guide.rowId, imagePath: guide.imagePath });
    }

    if (image) {
      await sendImage(sock, jid, image, caption);
      await waLog.record('OUT', jid, null, 'image', guide.imagePath);
    } else {
      await this.sendOut(sock, jid, caption, `guide:${guide.rowId}`);
    }
    await this.sendNavigation(sock, jid, guide);
  }

  /** Setelah langkah selesai: tombol kembali / hubungi admin / buka web (maks 3 tombol). */
  private async sendNavigation(sock: any, jid: string, guide: WaGuide): Promise<void> {
    const { csContact } = await waSettings.getAll();
    const buttons: WaButton[] = [{ text: 'Kembali ke Menu', id: MENU_ROW_ID }];
    const parent = guide.parentId ? await prisma.waGuide.findUnique({ where: { id: guide.parentId }, select: { rowId: true, label: true } }) : null;
    if (parent) buttons.push({ text: `Kembali ke ${parent.label}`.slice(0, BUTTON_TEXT_MAX), id: parent.rowId });
    if (csContact) buttons.push({ text: 'Hubungi Admin', id: CONTACT_ROW_ID });
    const url = publicWebUrl();
    if (url) buttons.push({ text: 'Buka Web PKL', url });

    const inline = buttons.slice(0, MAX_INLINE_BUTTONS);
    this.rememberChoices(jid, inline.filter((b) => b.id).map((b) => ({ rowId: String(b.id), title: b.text })));
    const link = url ? `\nWeb Sistem Manajemen PKL: ${url}` : '';
    const sent = await this.sendButtonsOrFallback(sock, jid, { text: `Langkah berikutnya?${link}`, footer: 'Sistem Manajemen PKL', buttons: inline });
    if (!sent) {
      const menu = inline.map((b, i) => `*${i + 1}.* ${b.text}`).join('\n');
      await this.sendOut(sock, jid, `Langkah berikutnya?\n${menu}${link}\n\n_${COPY.numberedHint}_`, 'nav-bernomor');
    }
  }

  /**
   * Tombol native-flow kadang ditolak akun WhatsApp personal. Bila itu terjadi,
   * user tetap mendapat pilihan lewat daftar — balasan tidak boleh hilang.
   */
  private async sendButtonsOrFallback(
    sock: any,
    jid: string,
    input: { text: string; footer?: string; buttons: WaButton[] }
  ): Promise<boolean> {
    try {
      await sendButtons(sock, jid, input);
      await waLog.record('OUT', jid, null, 'buttons', `${input.text.slice(0, 40)} (${input.buttons.length} tombol)`);
      return true;
    } catch (err) {
      logger.warn('WA: pesan tombol ditolak, dicoba format daftar', { error: (err as Error).message });
      return false;
    }
  }

  /**
   * Render daftar pilihan. Yang terbukti tampil di chat pribadi akun personal adalah
   * teks biasa dan maksimal tiga tombol quick_reply per pesan, jadi cabang besar dipecah
   * ke beberapa pesan tombol. Bila WhatsApp menolak tombol sama sekali, user tetap
   * menerima daftar bernomor yang bisa dijawab dengan angka.
   */
  private async renderChoices(
    sock: any,
    jid: string,
    input: { heading: string; hint?: string; rows: ListRow[]; contact: ListRow | null }
  ): Promise<void> {
    const intro = input.hint ? `${input.heading}\n\n${input.hint}` : input.heading;
    const all = input.contact ? [...input.rows, input.contact] : input.rows;

    // "Hubungi Admin" ikut jadi tombol hanya bila masih ada ruang pada pesan terakhir;
    // kalau tidak, cukup ditulis di footer — user tinggal ketik "admin".
    const room = input.rows.length % MAX_INLINE_BUTTONS !== 0 && input.rows.length < MAX_INLINE_BUTTONS * MAX_BUTTON_MESSAGES;
    const buttonRows = input.contact && room ? all : [...input.rows];
    const footer = input.contact && !room ? COPY.contactHint : 'Sistem Manajemen PKL';

    const chunks: ListRow[][] = [];
    for (let i = 0; i < buttonRows.length; i += MAX_INLINE_BUTTONS) chunks.push(buttonRows.slice(i, i + MAX_INLINE_BUTTONS));

    // Lebih dari dua pesan tombol membuat layar penuh: pakai daftar bernomor saja.
    if (chunks.length > MAX_BUTTON_MESSAGES) {
      this.rememberChoices(jid, all);
      await this.sendNumberedChoices(sock, jid, intro, all);
      return;
    }

    this.rememberChoices(jid, buttonRows);
    for (let i = 0; i < chunks.length; i++) {
      const buttons: WaButton[] = chunks[i].map((r) => ({ text: r.title.slice(0, BUTTON_TEXT_MAX), id: r.rowId }));
      const text = i === 0 ? intro : `${COPY.moreOptions} (${i + 1}/${chunks.length}):`;
      const sent = await this.sendButtonsOrFallback(sock, jid, { text, footer, buttons });
      if (!sent) {
        const from = i * MAX_INLINE_BUTTONS;
        this.rememberChoices(jid, all);
        await this.sendNumberedChoices(sock, jid, intro, all.slice(from), from);
        return;
      }
    }
  }

  /** Cadangan yang selalu bisa dikirim: teks + angka yang bisa diketik. */
  private async sendNumberedChoices(sock: any, jid: string, text: string, rows: ListRow[], from = 0): Promise<void> {
    const list = rows.map((r, i) => `*${from + i + 1}.* ${r.title}`).join('\n');
    await this.sendOut(sock, jid, `${text}\n\n${list}\n\n_${COPY.numberedHint}_`, 'pilihan-bernomor');
  }

  private toRows(nodes: WaGuide[]): ListRow[] {
    return nodes.map((n) => ({ rowId: n.rowId, title: n.label.slice(0, 72) }));
  }

  private async sendOut(sock: any, jid: string, text: string, marker: string): Promise<void> {
    await sendText(sock, jid, text);
    await waLog.record('OUT', jid, null, 'text', `${marker}: ${text.slice(0, 200)}`);
  }

  /** Reaksi di pesan user selama cooldown — sekali per masa tahan, dan diam bila ditolak WhatsApp. */
  private async markCooldown(sock: any, jid: string, key: any): Promise<void> {
    if (!key?.id || !claimReact(jid)) return;
    try {
      await sendReact(sock, jid, key, COOLDOWN_REACTION);
      await waLog.record('OUT', jid, null, 'react', COOLDOWN_REACTION);
    } catch (err) {
      logger.warn('WA: reaksi cooldown gagal dikirim', { jid, error: (err as Error).message });
    }
  }

  private async sendContact(sock: any, jid: string): Promise<void> {
    const { csContact } = await waSettings.getAll();
    const url = publicWebUrl();
    const text = csContact
      ? `${COPY.contactHeader}\n${csContact}\n\n${COPY.contactTail}`
      : COPY.contactMissing;
    await this.sendOut(sock, jid, text, 'contact');

    const buttons: WaButton[] = [{ text: 'Kembali ke Menu', id: MENU_ROW_ID }];
    if (url) buttons.push({ text: 'Buka Web PKL', url });
    const sent = await this.sendButtonsOrFallback(sock, jid, { text: 'Bisa dibantu hal lain?', footer: 'Sistem Manajemen PKL', buttons });
    if (!sent) await this.sendOut(sock, jid, 'Ketik *menu* untuk melihat panduan lagi.', 'contact-nav');
  }
}

export const waReplier = new WaReplierService();
