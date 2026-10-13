import { z } from 'zod';

/**
 * Skema validasi Surat Pernyataan PKL (Fase 2: pendaftaran ulang).
 */
export const generatePernyataanSchema = z.object({
  // Nama siswa, kelas/program keahlian, dan tempat PKL TIDAK diterima
  // dari klien — diambil server dari data master siswa & pendaftaran Fase 1.
  // No. HP siswa boleh diisi siswa (default dari profil siswa bila dikosongkan).
  namaOrtu: z.string().max(150).optional(),
  alamatSiswa: z.string().max(500).optional(),
  hpOrtu: z.string().max(30).optional(),
  hpSiswa: z.string().max(30).optional(),
});

export type GeneratePernyataanDTO = z.infer<typeof generatePernyataanSchema>;