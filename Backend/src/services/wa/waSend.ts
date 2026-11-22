import { logger } from '../../config/logger';

/** quoted = balas menempel pesan user. */
export interface SendOptions {
  quoted?: any;
}

export const sendText = async (sock: any, jid: string, text: string, opts: SendOptions = {}): Promise<any> =>
  sock.sendMessage(jid, { text }, opts);

/** Reaksi emoji; `key` = `msg.key` pesan yang direaksi — bot menandai pesan yang tak dijawab karena cooldown. */
export const sendReact = async (sock: any, jid: string, key: any, emoji: string): Promise<any> =>
  sock.sendMessage(jid, { react: { text: emoji, key } });

export const sendImage = async (sock: any, jid: string, image: Buffer, caption: string, opts: SendOptions = {}): Promise<any> =>
  sock.sendMessage(jid, { image, caption }, opts);

/** Satu baris pilihan (tombol cepat atau daftar bernomor). */
export interface ListRow {
  rowId: string;
  title: string;
}

/**
 * Tombol interaktif (native flow). Baileys fork ini memetakan isi `nativeFlow`
 * sendiri: `id` → quick_reply, `url` → cta_url, `copy` → cta_copy,
 * `call` → cta_call, `sections` → single_select (bottom sheet).
 * Klik quick_reply dibalas WhatsApp sebagai `interactiveResponseMessage`
 * dengan `paramsJson` berisi `button_reply.id` — lihat extractInboundText.
 */
export interface WaButton {
  /** Dipotong WhatsApp sekitar 30 karakter. */
  text: string;
  /** ID yang dikirim balik saat ditekan. */
  id?: string;
  /** Bila diisi, tombol membuka browser/tautan alih-alih membalas. */
  url?: string;
}

export interface ButtonsInput {
  text: string;
  footer?: string;
  buttons: WaButton[];
  /** Lebih dari tiga tombol: sisanya masuk daftar "Pilihan lain". */
  optionText?: string;
  optionTitle?: string;
}

export const sendButtons = async (sock: any, jid: string, input: ButtonsInput, opts: SendOptions = {}): Promise<any> => {
  const content: any = { nativeFlow: input.buttons, text: input.text };
  if (input.footer) content.footer = input.footer;
  if (input.optionText) content.optionText = input.optionText;
  if (input.optionTitle) content.optionTitle = input.optionTitle;
  return sock.sendMessage(jid, content, opts);
};

/** Hidetag: sebut semua anggota grup agar pengingat fase benar-benar menotifikasi tiap anggota. */
export const sendHidetag = async (sock: any, groupJid: string, text: string): Promise<any> => {
  let mentions: string[] = [];
  try {
    const meta = await sock.groupMetadata(groupJid);
    mentions = (meta?.participants ?? []).map((p: any) => p.id).filter(Boolean);
  } catch (err) {
    logger.warn('WA: metadata grup gagal, pengingat dikirim tanpa hidetag', {
      groupJid,
      error: (err as Error).message,
    });
  }
  return sock.sendMessage(groupJid, { text, mentions });
};
