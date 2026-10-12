import { z } from 'zod';

/**
 * Surat permohonan manual (admin): semua siswa pendaftar satu perusahaan.
 * ID pakai min(1) — company/gelombang seed QA memakai ID non-CUID.
 */
export const generatePermohonanSchema = z.object({
  cohortId: z.string().min(1, 'ID gelombang tidak valid'),
  companyId: z.string().min(1, 'ID perusahaan tidak valid'),
  number: z.string().max(80).optional().nullable(),
});

export type GeneratePermohonanDTO = z.infer<typeof generatePermohonanSchema>;

/** Surat penugasan pembimbing (admin): daftar tujuan = perusahaan siswa bimbingan. */
export const generatePenugasanSchema = z.object({
  supervisorId: z.string().min(1, 'ID guru pembimbing tidak valid'),
  number: z.string().max(80).optional().nullable(),
  dasar: z.string().max(600).optional().nullable(),
});

export type GeneratePenugasanDTO = z.infer<typeof generatePenugasanSchema>;
