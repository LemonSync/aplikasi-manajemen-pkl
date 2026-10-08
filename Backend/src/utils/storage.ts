import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

/**
 * Utilitas penyimpanan file.
 * File disimpan DI LUAR webroot (storage root) dan diakses via endpoint terkontrol,
 * bukan langsung dari static server. Ini mencegah eksekusi file berbahaya.
 */

/** Sub-folder kategori dokumen. */
export type StorageCategory = 'documents' | 'letters' | 'avatars' | 'visits' | 'temp';

/**
 * Memastikan direktori ada (rekursif), lalu mengembalikan path absolutnya.
 */
export const ensureDir = (dirPath: string): string => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

/**
 * Mengembalikan path absolut folder kategori (dan memastikan ada).
 * Struktur: <STORAGE_ROOT>/<category>/<YYYY>/<MM>
 */
export const categoryDir = (category: StorageCategory, date = new Date()): string => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dir = path.join(env.storageRoot, category, year, month);
  return ensureDir(dir);
};

/**
 * Menyimpan buffer ke storage dan mengembalikan path RELATIF terhadap storage root
 * (aman untuk disimpan di DB, tidak membocorkan path absolut server).
 */
export const saveBuffer = (
  category: StorageCategory,
  filename: string,
  buffer: Buffer
): { relativePath: string; absolutePath: string } => {
  const dir = categoryDir(category);
  const absolutePath = path.join(dir, filename);
  fs.writeFileSync(absolutePath, buffer);
  const relativePath = path.relative(env.storageRoot, absolutePath).split(path.sep).join('/');
  return { relativePath, absolutePath };
};

/**
 * Menyelesaikan path relatif dari DB menjadi path absolut (dengan proteksi traversal).
 */
export const resolveStoredPath = (relativePath: string): string => {
  const absolutePath = path.resolve(env.storageRoot, relativePath);
  // Pastikan hasil resolve tetap di dalam storage root.
  if (!absolutePath.startsWith(path.resolve(env.storageRoot))) {
    throw new Error('Path file tidak valid');
  }
  return absolutePath;
};

/**
 * Menghapus file bila ada (silent).
 */
export const deleteStoredFile = (relativePath: string): void => {
  try {
    const absolutePath = resolveStoredPath(relativePath);
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch {
    // abaikan: file mungkin sudah tidak ada
  }
};

/**
 * Membaca file sebagai buffer (dipakai untuk stream/download terkontrol).
 */
export const readStoredFile = (relativePath: string): Buffer | null => {
  try {
    const absolutePath = resolveStoredPath(relativePath);
    if (!fs.existsSync(absolutePath)) return null;
    return fs.readFileSync(absolutePath);
  } catch {
    return null;
  }
};

/** Memastikan storage root ada saat bootstrap. */
export const initStorage = (): void => {
  ensureDir(env.storageRoot);
  (['documents', 'letters', 'avatars', 'visits', 'temp'] as StorageCategory[]).forEach((c) =>
    ensureDir(path.join(env.storageRoot, c))
  );
};
