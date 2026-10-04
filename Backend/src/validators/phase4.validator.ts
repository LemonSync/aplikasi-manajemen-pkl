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
  studentId: z.string().cuid('ID siswa tidak valid'),
  groupId: z.string().cuid().optional().nullable(),
  scoreDudi: z.number().min(0, 'Nilai minimal 0').max(100, 'Nilai maksimal 100').optional(),
  aspects: z.array(gradeAspectSchema).min(1, 'Minimal satu indikator').max(20).optional(),
  note: z.string().max(2000).optional().nullable(),
});

export const updateGuidanceScoreSchema = z.object({
  scoreGuidance: z.number().min(0).max(100),
  note: z.string().max(2000).optional().nullable(),
});

export const listGradeQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  groupId: z.string().cuid().optional(),
  studentId: z.string().cuid().optional(),
});

export type CreateGradeDTO = z.infer<typeof createGradeSchema>;
export type UpdateGuidanceScoreDTO = z.infer<typeof updateGuidanceScoreSchema>;
export type ListGradeQueryDTO = z.infer<typeof listGradeQuerySchema>;

// Rekap admin: penilaian dikelompokkan kelas → kelompok → siswa
export const recapByClassQuerySchema = z.object({
  cohortId: z.string().cuid().optional(),
});

export type RecapByClassQueryDTO = z.infer<typeof recapByClassQuerySchema>;

// --- Feedback ---
export const createFeedbackSchema = z.object({
  studentId: z.string().cuid('ID siswa tidak valid'),
  groupId: z.string().cuid().optional().nullable(),
  body: z.string().min(3, 'Feedback minimal 3 karakter').max(5000),
});

export const listFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  studentId: z.string().cuid().optional(),
  groupId: z.string().cuid().optional(),
});

export type CreateFeedbackDTO = z.infer<typeof createFeedbackSchema>;
export type ListFeedbackQueryDTO = z.infer<typeof listFeedbackQuerySchema>;

// --- Surat Penarikan ---
export const generateWithdrawalLetterSchema = z.object({
  groupId: z.string().cuid('ID kelompok tidak valid'),
  studentIds: z.array(z.string().cuid()).min(1, 'Minimal 1 siswa'),
  number: z.string().max(80).optional().nullable(),
});

export type GenerateWithdrawalLetterDTO = z.infer<typeof generateWithdrawalLetterSchema>;

// --- Surat Pengantar PKL ---
export const generatePengantarLetterSchema = z.object({
  groupId: z.string().cuid('ID kelompok tidak valid'),
  number: z.string().max(80).optional().nullable(),
});

export type GeneratePengantarLetterDTO = z.infer<typeof generatePengantarLetterSchema>;

// --- Surat Penugasan Pembimbing ---
export const generatePenugasanLetterSchema = z.object({
  groupId: z.string().cuid('ID kelompok tidak valid'),
  supervisorId: z.string().cuid('ID guru pembimbing tidak valid'),
  number: z.string().max(80).optional().nullable(),
});

export type GeneratePenugasanLetterDTO = z.infer<typeof generatePenugasanLetterSchema>;

// --- Fase ---
export const completePhaseSchema = z.object({
  studentIds: z.array(z.string().cuid()).min(1, 'Minimal 1 siswa'),
});

export type CompletePhaseDTO = z.infer<typeof completePhaseSchema>;
