import { z } from 'zod';

/**
 * Skema validasi Surat Pernyataan PKL (Fase 2: pendaftaran ulang).
 * Seluruh data yang dicetak ke surat WAJIB terisi — tidak boleh kosong.
 */
export const generatePernyataanSchema = z.object({
  // Nama siswa, kelas/program keahlian, dan tempat PKL TIDAK diterima
  // dari klien — diambil server dari data master siswa & pendaftaran Fase 1.
  namaOrtu: z.string().trim().min(1, 'Nama orang tua/wali wajib diisi').max(150),
  alamatSiswa: z.string().trim().min(1, 'Alamat siswa wajib diisi').max(500),
  hpOrtu: z.string().trim().min(1, 'No. HP orang tua/wali wajib diisi').max(30),
  hpSiswa: z.string().trim().min(1, 'No. HP siswa wajib diisi').max(30),
});

export type GeneratePernyataanDTO = z.infer<typeof generatePernyataanSchema>;
