import * as XLSX from 'xlsx';
import { teacherRegistryRepository } from '../repositories/teacherRegistry.repository';
import { teacherRegistryService, NIP_PATTERN, normalizeNip, TeacherProvisionResult } from './teacherRegistry.service';
import { majorRepository } from '../repositories/major.repository';
import { cohortRepository } from '../repositories/cohort.repository';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { ensureSchoolMajors } from './schoolMajor.service';

export interface TeacherImportRow {
  nip: string;
  fullName: string;
  majorCode?: string;
}

export interface TeacherImportDuplicate {
  nip: string;
  fullName: string;
  reason: string;
}

export interface TeacherImportResult {
  total: number;
  created: number;
  updated: number;
  duplicates: TeacherImportDuplicate[];
  errors: string[];
  /** Akun login (username = NIP) yang dibuat otomatis beserta password acaknya — tampilkan sekali ke admin. */
  accounts: TeacherProvisionResult;
}

/** Pemetaan nama header kolom di file Excel (nama kolom tiap file bisa berbeda-beda). */
export interface TeacherHeaderMapping {
  nip?: string;
  fullName?: string;
  majorCode?: string;
}

export interface TeacherInspectResult {
  headers: string[];
  detected: { nip: string | null; fullName: string | null; majorCode: string | null };
}

/**
 * Service import data guru dari Excel.
 * Format Excel: NIP | Nama Lengkap | Jurusan (kode, opsional)
 */
export class TeacherRegistryImportService {
  /** Baca baris header file + auto-detect kolom (untuk modal pemetaan sebelum import). */
  inspect(buffer: Buffer): TeacherInspectResult {
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
        nip: findIdx((h) => h.includes('nip') && !h.includes('nisn')),
        fullName: findIdx((h) => h.includes('nama lengkap') || h.includes('nama guru') || h === 'nama' || h.includes('nama') || h.includes('fullname')),
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
   * Parse file Excel dan return data guru + error per baris.
   * Nama header kolom bisa berbeda antar file — dipetakan lewat `mapping`
   * (input admin dari modal sebelum import). Tanpa mapping, pakai nama umum.
   */
  parseExcel(buffer: Buffer, mapping?: TeacherHeaderMapping): { rows: TeacherImportRow[]; errors: string[] } {
    const { headerRow, dataRows } = this.readSheet(buffer);
    if (headerRow.filter((h) => h).length === 0) throw new BadRequestError('File Excel tidak punya baris header');

    const nipCol = this.findCol(headerRow, mapping?.nip ? [mapping.nip] : ['nip', 'nip guru']);
    const nameCol = this.findCol(
      headerRow,
      mapping?.fullName ? [mapping.fullName] : ['nama lengkap', 'nama guru', 'nama', 'fullname', 'full name']
    );
    const majorCol = this.findCol(headerRow, mapping?.majorCode ? [mapping.majorCode] : ['jurusan', 'major', 'keahlian']);

    const missing: string[] = [];
    if (nipCol < 0) missing.push(`NIP${mapping?.nip ? ` ("${mapping.nip}")` : ''}`);
    if (nameCol < 0) missing.push(`Nama${mapping?.fullName ? ` ("${mapping.fullName}")` : ''}`);
    if (missing.length > 0) {
      throw new BadRequestError(
        `Kolom ${missing.join(', ')} tidak ditemukan di file. ` +
          `Header yang tersedia: ${headerRow.filter((h) => h).join(' | ') || '(kosong)'}`
      );
    }

    const result: TeacherImportRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] ?? [];
      const rowNum = i + 2; // +2 karena baris header + 0-index
      const get = (col: number): string => (col >= 0 && col < row.length ? String(row[col] ?? '').trim() : '');

      const nip = normalizeNip(get(nipCol));
      const fullName = get(nameCol);
      const majorCode = get(majorCol);

      // Baris kosong total (mis. baris kosong di tengah/ekor file) -> dilewati diam-diam
      if (!nip && !fullName && !majorCode) continue;

      if (!nip) {
        errors.push(`Baris ${rowNum}: NIP kosong`);
        continue;
      }
      if (!fullName) {
        errors.push(`Baris ${rowNum}: Nama Lengkap kosong`);
        continue;
      }
      if (!NIP_PATTERN.test(nip)) {
        errors.push(`Baris ${rowNum}: NIP harus 18 digit (dapat ${nip.length} digit)`);
        continue;
      }

      result.push({ nip, fullName, majorCode: majorCode || undefined });
    }

    return { rows: result, errors };
  }

  /**
   * Import data guru ke database dengan pengecekan duplikat:
   * - NIP sama lebih dari sekali dalam 1 file -> pakai baris pertama, sisanya dilaporkan
   * - NIP sudah ada di master dengan data sama -> dilewati (dilaporkan, tidak menimpa)
   * - NIP sudah terdaftar di gelombang lain -> dilewati (dilaporkan, gelombang asal tidak berubah)
   * - Data berbeda / baris hasil-hapus -> diperbarui/dipulihkan (upsert, alur import-ulang tetap jalan)
   * Setelahnya akun login (username = NIP) dibuat otomatis untuk semua baris aktif
   * gelombang ini yang belum punya akun.
   */
  async importData(
    rows: TeacherImportRow[],
    cohortId: string,
    parseErrors: string[] = [],
    actor?: { actorId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<TeacherImportResult> {
    await ensureSchoolMajors();
    // Validasi cohort exists
    const cohort = await cohortRepository.findById(cohortId);
    if (!cohort) throw new NotFoundError('Gelombang tidak ditemukan');

    // Resolve major codes ke major IDs
    const majorMap = new Map<string, string>();
    const majors = await majorRepository.findMany();
    for (const m of majors) {
      majorMap.set(m.code.toUpperCase(), m.id);
    }

    const itemsToImport: Array<{
      nip: string;
      fullName: string;
      cohortId: string;
      majorId: string | null;
    }> = [];
    const errors: string[] = [];

    for (const row of rows) {
      let majorId: string | null = null;
      if (row.majorCode) {
        majorId = majorMap.get(row.majorCode.toUpperCase()) ?? null;
        if (!majorId) {
          errors.push(`NIP ${row.nip}: Jurusan "${row.majorCode}" tidak ditemukan`);
          continue;
        }
      }

      itemsToImport.push({
        nip: row.nip,
        fullName: row.fullName,
        cohortId,
        majorId,
      });
    }

    // ---- Pengecekan duplikat ----
    const duplicates: TeacherImportDuplicate[] = [];

    // 1) NIP dobel di dalam file yang sama -> baris pertama dipakai, sisanya dilaporkan
    const seenInFile = new Set<string>();
    const candidates: typeof itemsToImport = [];
    for (const item of itemsToImport) {
      if (seenInFile.has(item.nip)) {
        duplicates.push({
          nip: item.nip,
          fullName: item.fullName,
          reason: 'Duplikat dalam file yang sama — baris pertama yang dipakai',
        });
        continue;
      }
      seenInFile.add(item.nip);
      candidates.push(item);
    }

    // 2) Cocokkan dengan master yang sudah ada (termasuk lintas gelombang)
    const existingRows = await teacherRegistryRepository.findManyByNipGlobal(candidates.map((c) => c.nip));
    const existingMap = new Map(existingRows.map((r) => [r.nip, r]));
    const toImport: typeof itemsToImport = [];

    for (const item of candidates) {
      const existing = existingMap.get(item.nip);

      if (!existing) {
        toImport.push(item);
        continue;
      }

      // Sudah terdaftar di gelombang lain -> jangan dipindah, laporkan
      if (existing.cohortId !== cohortId) {
        duplicates.push({
          nip: item.nip,
          fullName: item.fullName,
          reason: `Sudah terdaftar di gelombang "${existing.cohort.name}" — dilewati`,
        });
        continue;
      }

      // Sudah ada dengan data yang sama persis -> dilewati (tidak terduplikasi, tidak menimpa)
      const isSameData =
        existing.isActive &&
        existing.fullName === item.fullName &&
        (existing.majorId ?? null) === (item.majorId ?? null);
      if (isSameData) {
        duplicates.push({
          nip: item.nip,
          fullName: item.fullName,
          reason: 'Sudah ada di Master Guru dengan data yang sama — dilewati',
        });
        continue;
      }

      // Data berbeda ATAU baris nonaktif (hasil hapus) -> upsert memperbarui/memulihkan
      toImport.push(item);
    }

    // Import ke database (hanya baris yang bukan duplikat)
    const result = await teacherRegistryRepository.upsertMany(toImport);

    // Akun login dibuat otomatis untuk semua baris aktif gelombang ini
    const accounts = await teacherRegistryService.ensureAccounts(cohortId, actor);

    return {
      total: rows.length,
      created: result.created,
      updated: result.updated,
      duplicates,
      errors: [...parseErrors, ...errors, ...result.errors],
      accounts,
    };
  }
}

export const teacherRegistryImportService = new TeacherRegistryImportService();
