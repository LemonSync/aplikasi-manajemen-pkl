import { z } from 'zod';

/**
 * Skema validasi modul Fase 4: penilaian, laporan akhir, surat penarikan.
 */

// --- Nilai / Grade ---
export const gradeAspectSchema = z.object({
  label: z.string().min(1, 'Nama indikator wajib diisi').max(120),
  score: z.number().min(0, 'Nilai minimal 0').max(100, 'Nilai maksimal 100'),
});

export const createGradeSchema = z.object({
  // Opsional: siswa menginput untuk dirinya sendiri (diambil dari token).
  studentId: z.string().cuid('ID siswa tidak valid').optional(),
  scoreDudi: z.number().min(0, 'Nilai minimal 0').max(100, 'Nilai maksimal 100').optional(),
  aspects: z.array(gradeAspectSchema).min(1, 'Minimal satu indikator').max(20).optional(),
  note: z.string().max(2000).optional().nullable(),
});

export const approveGradeSchema = z.object({
  approved: z.boolean(),
  note: z.string().max(2000).optional().nullable(),
});

export const updateGuidanceScoreSchema = z.object({
  scoreGuidance: z.number().min(0).max(100),
  note: z.string().max(2000).optional().nullable(),
});

export const listGradeQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  studentId: z.string().cuid().optional(),
});

export type CreateGradeDTO = z.infer<typeof createGradeSchema>;
export type ApproveGradeDTO = z.infer<typeof approveGradeSchema>;
export type UpdateGuidanceScoreDTO = z.infer<typeof updateGuidanceScoreSchema>;
export type ListGradeQueryDTO = z.infer<typeof listGradeQuerySchema>;

// Rekap admin: penilaian dikelompokkan kelas → kelompok → siswa
export const recapByClassQuerySchema = z.object({
  cohortId: z.string().cuid().optional(),
});

export type RecapByClassQueryDTO = z.infer<typeof recapByClassQuerySchema>;

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
