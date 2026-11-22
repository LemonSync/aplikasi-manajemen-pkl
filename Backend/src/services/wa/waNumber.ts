import { BadRequestError } from '../../errors/AppError';

/**
 * Format yang disimpan ke DB dan dipakai sebagai JID SELALU internasional tanpa tanda
 * plus (62812…). WhatsApp menolak nomor lokal Indonesia (0812…) dengan `bad-request`,
 * jadi kebiasaan mengetik "0812..." harus dibersihkan sebelum menyentuh Baileys.
 */

const MIN_DIGITS = 10;
const MAX_DIGITS = 16;
const ID_PREFIX = '62';

/** Nomor bebas format -> digit internasional, atau null bila tidak meyakinkan. */
export const normalizeWaNumber = (raw: unknown): string | null => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  const withoutTrunk = digits.startsWith('00')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? `${ID_PREFIX}${digits.slice(1)}`
      : digits;

  if (withoutTrunk.length < MIN_DIGITS || withoutTrunk.length > MAX_DIGITS) return null;
  return withoutTrunk;
};

/** Nomor bebas format -> digit internasional; lempar BadRequestError bila tidak valid. */
export const requireWaNumber = (raw: unknown): string => {
  const normalized = normalizeWaNumber(raw);
  if (!normalized) {
    throw new BadRequestError(`Nomor WhatsApp "${String(raw ?? '')}" tidak valid. Gunakan format 6281234567890.`);
  }
  return normalized;
};

/** Angka polos dari JID/nomor apa pun (buang @s.whatsapp.net dan :device). */
export const bareNumber = (jidOrNumber: string): string => String(jidOrNumber).split('@')[0].split(':')[0];

export const toUserJid = (raw: unknown): string => `${requireWaNumber(raw)}@s.whatsapp.net`;

/** Buang duplikat sambil mempertahankan urutan. */
export const dedupeNumbers = (numbers: string[]): string[] => [...new Set(numbers)];
