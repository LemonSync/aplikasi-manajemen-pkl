import { env } from '../config/env';
import { DATE_LOCALE } from '../config/constants';

/**
 * Helper tanggal berbasis timezone aplikasi (default Asia/Jakarta).
 */

/**
 * Mengembalikan awal hari (00:00:00) pada zona waktu aplikasi sebagai Date.
 * Dipakai untuk kolom `date` (tipe DATE) pada absensi/jurnal agar konsisten.
 */
export const startOfToday = (base: Date = new Date()): Date => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const iso = fmt.format(base); // YYYY-MM-DD
  return new Date(`${iso}T00:00:00.000Z`);
};

/**
 * Format tanggal ke ISO date (YYYY-MM-DD) pada zona waktu aplikasi.
 */
export const toDateOnly = (base: Date = new Date()): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
};

/**
 * Format tanggal ke string lokal Indonesia.
 */
export const formatDate = (base: Date, withTime = false): string => {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    timeZone: env.TIMEZONE,
    dateStyle: 'long',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(base);
};

/**
 * Cek apakah dua tanggal jatuh pada hari kalender yang sama (di zona aplikasi).
 */
export const isSameDay = (a: Date, b: Date): boolean => toDateOnly(a) === toDateOnly(b);
