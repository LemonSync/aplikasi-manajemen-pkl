import * as XLSX from 'xlsx';
import { studentRegistryRepository } from '../repositories/studentRegistry.repository';
import { majorRepository } from '../repositories/major.repository';
import { cohortRepository } from '../repositories/cohort.repository';
import { BadRequestError, NotFoundError } from '../errors/AppError';

export interface ImportRow {
  nisn: string;
  fullName: string;
  className: string;
  majorCode?: string;
}

export interface ImportDuplicate {
  nisn: string;
  fullName: string;
  reason: string;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  duplicates: ImportDuplicate[];
  errors: string[];
}

/** Pemetaan nama header kolom di file Excel (nama kolom tiap file bisa berbeda-beda). */
export interface HeaderMapping {
  nisn?: string;
  fullName?: string;
  className?: string;
  majorCode?: string;
}

export interface InspectResult {
  headers: string[];
  detected: { nisn: string | null; fullName: string | null; className: string | null; majorCode: string | null };
}

/**
 * Service import data siswa dari Excel.
 * Format Excel: NISN | Nama Lengkap | Kelas | Jurusan (kode)
 */
export class StudentRegistryImportService {
  /** Baca baris header file + auto-detect kolom (untuk modal pemetaan sebelum import). */
  inspect(buffer: Buffer): InspectResult {
    const { headerRow } = this.readSheet(buffer);
    const lowered = headerRow.map((h) => h.toLowerCase());
    const findIdx = (pred: (h: string) => boolean): string | null => {
      const idx = lowered.findIndex(pred);
      return idx >= 0 ? headerRow[idx] : null;
    };
    const has = (h: string, ...words: string[]): boolean => words.some((w) => h.includes(w));
    return {
      headers: headerRow,
      detected: {
        nisn: findIdx((h) => has(h, 'nisn')),
        fullName: findIdx((h) => h.includes('nama lengkap') || h.includes('nama siswa') || h === 'nama' || h.includes('nama') || h.includes('fullname')),
        className: findIdx((h) => has(h, 'kelas', 'rombel', 'class')),
        majorCode: findIdx((h) => has(h, 'jurusan', 'major', 'kompetensi', 'keahlian')),
      },
    };
  }

  private readSheet(buffer: Buffer): { headerRow: string[]; dataRows: Array<Array<unknown>> } {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestError('File Excel kosong');

    const sheet = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: '' });
    if (aoa.length === 0) throw new BadRequestError('File Excel kosong');

    const headerRow = (aoa[0] ?? []).map((v) => String(v).trim());
    return { headerRow, dataRows: aoa.slice(1) };
  }

  /** Cari indeks kolom: exact (case-insensitive) lalu contains. */
  private findCol(headerRow: string[], candidates: string[]): number {
    for (const cand of candidates) {
      const c = cand.trim().toLowerCase();
      if (!c) continue;
      const idx = headerRow.findIndex((h) => h.toLowerCase() === c);
      if (idx >= 0) return idx;
    }
    for (const cand of candidates) {
      const c = cand.trim().toLowerCase();
      if (!c) continue;
      const idx = headerRow.findIndex((h) => h.toLowerCase().includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  /**
   * Parse file Excel dan return data siswa + error per baris.
   * Nama header kolom bisa berbeda antar file — dipetakan lewat `mapping`
   * (input admin dari modal sebelum import). Tanpa mapping, pakai nama umum.
   */
  parseExcel(buffer: Buffer, mapping?: HeaderMapping): { rows: ImportRow[]; errors: string[] } {
    const { headerRow, dataRows } = this.readSheet(buffer);
    if (headerRow.filter((h) => h).length === 0) throw new BadRequestError('File Excel tidak punya baris header');

    const nisnCol = this.findCol(headerRow, mapping?.nisn ? [mapping.nisn] : ['nisn']);
    const nameCol = this.findCol(
      headerRow,
      mapping?.fullName ? [mapping.fullName] : ['nama lengkap', 'nama siswa', 'nama', 'fullname', 'full name']
    );
    const classCol = this.findCol(headerRow, mapping?.className ? [mapping.className] : ['kelas siswa', 'kelas', 'rombel', 'class']);
    const majorCol = this.findCol(headerRow, mapping?.majorCode ? [mapping.majorCode] : ['jurusan', 'major', 'keahlian']);

    const missing: string[] = [];
    if (nisnCol < 0) missing.push(`NISN${mapping?.nisn ? ` ("${mapping.nisn}")` : ''}`);
    if (nameCol < 0) missing.push(`Nama${mapping?.fullName ? ` ("${mapping.fullName}")` : ''}`);
    if (classCol < 0) missing.push(`Kelas${mapping?.className ? ` ("${mapping.className}")` : ''}`);
    if (missing.length > 0) {
      throw new BadRequestError(
        `Kolom ${missing.join(', ')} tidak ditemukan di file. ` +
          `Header yang tersedia: ${headerRow.filter((h) => h).join(' | ') || '(kosong)'}`
      );
    }

    const result: ImportRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] ?? [];
      const rowNum = i + 2; // +2 karena baris header + 0-index
      const get = (col: number): string => (col >= 0 && col < row.length ? String(row[col] ?? '').trim() : '');

      const nisn = get(nisnCol);
      const fullName = get(nameCol);
      const className = get(classCol);
      const majorCode = get(majorCol);

      // Baris kosong total (mis. baris kosong di tengah/ekor file) -> dilewati diam-diam
      if (!nisn && !fullName && !className && !majorCode) continue;

      if (!nisn) {
        errors.push(`Baris ${rowNum}: NISN kosong`);
        continue;
      }
      if (!fullName) {
        errors.push(`Baris ${rowNum}: Nama Lengkap kosong`);
        continue;
      }
      if (!className) {
        errors.push(`Baris ${rowNum}: Kelas kosong`);
        continue;
      }
      if (nisn.length !== 10) {
        errors.push(`Baris ${rowNum}: NISN harus 10 digit (dapat ${nisn.length} digit)`);
        continue;
      }

      result.push({ nisn, fullName, className, majorCode: majorCode || undefined });
    }

    return { rows: result, errors };
  }

  /**
   * Import data siswa ke database dengan pengecekan duplikat:
   * - NISN sama lebih dari sekali dalam 1 file -> pakai baris pertama, sisanya dilaporkan
   * - NISN sudah ada di master dengan data sama -> dilewati (dilaporkan, tidak menimpa)
   * - NISN sudah terdaftar di gelombang lain -> dilewati (dilaporkan, gelombang asal tidak berubah)
   * - Data berbeda / baris hasil-hapus -> diperbarui/dipulihkan (upsert, alur import-ulang tetap jalan)
   */
  async importData(
    rows: ImportRow[],
    cohortId: string,
    parseErrors: string[] = []
  ): Promise<ImportResult> {
    // Validasi cohort exists
    const cohort = await cohortRepository.findById(cohortId);
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    // Resolve major codes ke major IDs
    const majorMap = new Map<string, string>();
    const majors = await majorRepository.findMany();
    for (const m of majors) {
      majorMap.set(m.code.toUpperCase(), m.id);
    }

    // Validasi format kelas: harus cocok dengan pola XII-{JURUSAN}-{NOMOR}
    const classPattern = /^[A-Z]{2,5}-[A-Z]{2,5}-\d{1,2}$/i;
    const itemsToImport: Array<{
      nisn: string;
      fullName: string;
      className: string;
      cohortId: string;
      majorId: string | null;
    }> = [];
    const errors: string[] = [];

    for (const row of rows) {
      if (!classPattern.test(row.className)) {
        errors.push(`NISN ${row.nisn}: Format kelas "${row.className}" tidak valid. Gunakan format XII-RPL-2`);
        continue;
      }

      let majorId: string | null = null;
      if (row.majorCode) {
        majorId = majorMap.get(row.majorCode.toUpperCase()) ?? null;
        if (!majorId) {
          // Coba extract dari kelas (mis. XII-RPL-2 → RPL)
          const parts = row.className.split('-');
          if (parts.length >= 2) {
            majorId = majorMap.get(parts[1].toUpperCase()) ?? null;
          }
        }
        if (!majorId) {
          errors.push(`NISN ${row.nisn}: Jurusan "${row.majorCode}" tidak ditemukan`);
          continue;
        }
      } else {
        // Auto-detect dari kelas
        const parts = row.className.split('-');
        if (parts.length >= 2) {
          majorId = majorMap.get(parts[1].toUpperCase()) ?? null;
        }
      }

      itemsToImport.push({
        nisn: row.nisn,
        fullName: row.fullName,
        className: row.className.toUpperCase(),
        cohortId,
        majorId,
      });
    }

    // ---- Pengecekan duplikat ----
    const duplicates: ImportDuplicate[] = [];

    // 1) NISN dobel di dalam file yang sama -> baris pertama dipakai, sisanya dilaporkan
    const seenInFile = new Set<string>();
    const candidates: typeof itemsToImport = [];
    for (const item of itemsToImport) {
      if (seenInFile.has(item.nisn)) {
        duplicates.push({
          nisn: item.nisn,
          fullName: item.fullName,
          reason: 'Duplikat dalam file yang sama — baris pertama yang dipakai',
        });
        continue;
      }
      seenInFile.add(item.nisn);
      candidates.push(item);
    }

    // 2) Cocokkan dengan master yang sudah ada (termasuk lintas gelombang)
    const existingRows = await studentRegistryRepository.findManyByNisnGlobal(candidates.map((c) => c.nisn));
    const existingMap = new Map(existingRows.map((r) => [r.nisn, r]));
    const toImport: typeof itemsToImport = [];

    for (const item of candidates) {
      const existing = existingMap.get(item.nisn);

      if (!existing) {
        toImport.push(item);
        continue;
      }

      // Sudah terdaftar di gelombang lain -> jangan dipindah, laporkan
      if (existing.cohortId !== cohortId) {
        duplicates.push({
          nisn: item.nisn,
          fullName: item.fullName,
          reason: `Sudah terdaftar di gelombang "${existing.cohort.name}" — dilewati`,
        });
        continue;
      }

      // Sudah ada dengan data yang sama persis -> dilewati (tidak terduplikat, tidak menimpa)
      const isSameData =
        existing.isActive &&
        existing.fullName === item.fullName &&
        existing.className === item.className &&
        (existing.majorId ?? null) === (item.majorId ?? null);
      if (isSameData) {
        duplicates.push({
          nisn: item.nisn,
          fullName: item.fullName,
          reason: 'Sudah ada di Master Siswa dengan data yang sama — dilewati',
        });
        continue;
      }

      // Data berbeda ATAU baris nonaktif (hasil hapus) -> upsert memperbarui/memulihkan
      toImport.push(item);
    }

    // Import ke database (hanya baris yang bukan duplikat)
    const result = await studentRegistryRepository.upsertMany(toImport);

    return {
      total: rows.length,
      created: result.created,
      updated: result.updated,
      duplicates,
      errors: [...parseErrors, ...errors, ...result.errors],
    };
  }
}

export const studentRegistryImportService = new StudentRegistryImportService();
