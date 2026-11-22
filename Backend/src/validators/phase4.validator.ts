import { z } from 'zod';
import {
  PENILAIAN_GROUP_CODES,
  PENILAIAN_ITEM_KEYS,
  PENILAIAN_ITEMS,
} from '../config/penilaian.config';

/**
 * Skema validasi modul Fase 4: penilaian, laporan akhir, surat penarikan.
 */

// --- Nilai / Grade ---

/**
 * Satu butir LEMBARAN PENILAIAN. Label TIDAK dikirim klien — server selalu
 * mengambil bunyi resmi dari PENILAIAN_ITEMS agar form tidak bisa diubah diam-diam.
 */
export const gradeItemSchema = z.object({
  groupCode: z
    .string()
    .refine((v) => PENILAIAN_GROUP_CODES.includes(v), 'Kelompok penilaian tidak dikenal'),
  code: z.string().min(1, 'Kode butir wajib diisi').max(8),
  score: z.number().min(0, 'Nilai minimal 0').max(100, 'Nilai maksimal 100'),
});

const itemKey = (i: { groupCode: string; code: string }) => `${i.groupCode}:${i.code}`;

export const createGradeSchema = z
  .object({
    // Opsional: siswa menginput untuk dirinya sendiri (diambil dari token).
    studentId: z.string().cuid('ID siswa tidak valid').optional(),
    items: z.array(gradeItemSchema).min(1, 'Butir penilaian wajib diisi'),
    /** Nilai Laporan PKL — pembobot 20% pada Nilai Akhir. */
    scoreReport: z.number().min(0, 'Nilai laporan minimal 0').max(100, 'Nilai laporan maksimal 100'),
    /** Pendamping/mentor PKL dari perusahaan — penandatangan kolom "Pembimbing PKL". */
    mentorName: z.string().min(3, 'Nama pembimbing PKL wajib diisi').max(120),
    note: z.string().max(2000, 'Catatan maksimal 2000 karakter').optional().nullable(),
    /** Pernyataan final: setelah dikirim, nilai tidak dapat diubah siswa lagi. */
    confirmed: z
      .boolean()
      .refine((v) => v === true, 'Anda harus mengonfirmasi nilai final sebelum mengirim'),
  })
  .refine((d) => new Set(d.items.map(itemKey)).size === d.items.length, {
    message: 'Butir penilaian ganda',
    path: ['items'],
  })
  .refine(
    (d) => {
      const sent = new Set(d.items.map(itemKey));
      return PENILAIAN_ITEMS.every((item) => sent.has(`${item.groupCode}:${item.code}`));
    },
    { message: `Seluruh ${PENILAIAN_ITEM_KEYS.length} butir penilaian wajib diisi`, path: ['items'] }
  );

export const approveGradeSchema = z.object({
  approved: z.boolean(),
  note: z.string().max(2000).optional().nullable(),
});

export const listGradeQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  studentId: z.string().cuid().optional(),
});

export type CreateGradeDTO = z.infer<typeof createGradeSchema>;
export type ApproveGradeDTO = z.infer<typeof approveGradeSchema>;
export type ListGradeQueryDTO = z.infer<typeof listGradeQuerySchema>;

// Rekap admin: penilaian dikelompokkan kelas → kelompok → siswa
export const recapByClassQuerySchema = z.object({
  cohortId: z.string().cuid().optional(),
});

export type RecapByClassQueryDTO = z.infer<typeof recapByClassQuerySchema>;

// --- Sertifikat (fase 4) ---

/**
 * Nomor manual dari admin. Format contoh sekolah: 400.10.5.4/0108.151/SMKN9/XI/2025
 * — tidak divalidasi pola ketat karena nomor resmi bisa kapan saja berubah bunyi,
 * hanya panjangnya yang dibatasi (kolom VarChar(80)).
 */
export const setCertificateNumberSchema = z.object({
  number: z.string().min(3, 'Nomor terlalu pendek').max(80, 'Nomor terlalu panjang'),
});

/**
 * Nama penandatangan "Kepala Bagian Teknik dan Pengelolaan" — diketik siswa.
 * Boleh kosong (baris nama dibiarkan untuk ditandatangani manual di atas kertas).
 */
export const setCertificateSignatorySchema = z.object({
  kepalaBagianName: z
    .string()
    .trim()
    .max(120, 'Nama penandatangan maksimal 120 karakter'),
});

export const listCertificateQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  cohortId: z.string().cuid().optional(),
});

export type SetCertificateNumberDTO = z.infer<typeof setCertificateNumberSchema>;
export type SetCertificateSignatoryDTO = z.infer<typeof setCertificateSignatorySchema>;
export type ListCertificateQueryDTO = z.infer<typeof listCertificateQuerySchema>;

// --- Feedback (admin/guru → siswa) ---
export const createFeedbackSchema = z.object({
  studentId: z.string().cuid('ID siswa tidak valid'),
  body: z.string().min(3, 'Feedback minimal 3 karakter').max(5000),
});

export const listFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  studentId: z.string().cuid().optional(),
});

export type CreateFeedbackDTO = z.infer<typeof createFeedbackSchema>;
export type ListFeedbackQueryDTO = z.infer<typeof listFeedbackQuerySchema>;

// --- Surat bulk guru (pengantar / monitoring / penjemputan) ---
export const generateBulkLetterSchema = z.object({
  type: z.enum(['SURAT_PENGANTAR', 'SURAT_MONITORING', 'SURAT_PENJEMPUTAN']),
  number: z.string().max(80).optional().nullable(),
  subject: z.string().max(200).optional().nullable(),
  // Nomor surat balasan perusahaan (dipakai surat pengantar: "nomor :....tertanggal").
  replyNumber: z.string().max(80).optional().nullable(),
  // Wajib saat admin menerbitkan atas nama guru; guru sendiri diisi otomatis.
  supervisorId: z.string().cuid('ID guru pembimbing tidak valid').optional(),
});

export type GenerateBulkLetterDTO = z.infer<typeof generateBulkLetterSchema>;

// --- Fase ---
export const completePhaseSchema = z.object({
  studentIds: z.array(z.string().cuid()).min(1, 'Minimal 1 siswa'),
});

export type CompletePhaseDTO = z.infer<typeof completePhaseSchema>;
