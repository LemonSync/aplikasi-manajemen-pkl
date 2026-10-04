import { z } from 'zod';

/**
 * Skema validasi untuk generasi Surat Pengantar PKL dan Surat Penugasan Pembimbing.
 */

// --- Surat Pengantar PKL (Sekolah → Perusahaan) ---
export const generatePengantarLetterSchema = z.object({
  groupId: z.string().cuid('ID kelompok tidak valid'),
  number: z.string().max(80).optional().nullable(),
});

export type GeneratePengantarLetterDTO = z.infer<typeof generatePengantarLetterSchema>;

// --- Surat Penugasan Pembimbing (Sekolah → Guru → Perusahaan) ---
export const generatePenugasanLetterSchema = z.object({
  groupId: z.string().cuid('ID kelompok tidak valid'),
  supervisorId: z.string().cuid('ID guru pembimbing tidak valid'),
  number: z.string().max(80).optional().nullable(),
});

export type GeneratePenugasanLetterDTO = z.infer<typeof generatePenugasanLetterSchema>;
