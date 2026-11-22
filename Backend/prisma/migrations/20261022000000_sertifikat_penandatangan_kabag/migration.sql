-- Fase 4: nama penandatangan "Kepala Bagian Teknik dan Pengelolaan" diisi siswa,
-- dan baris sertifikat boleh dibuat sebelum logo diunggah (logo tetap wajib
-- saat PDF terbit).

-- AlterTable
ALTER TABLE `certificates` MODIFY `logoPath` VARCHAR(191) NULL,
    ADD COLUMN `kepalaBagianName` VARCHAR(120) NULL;
