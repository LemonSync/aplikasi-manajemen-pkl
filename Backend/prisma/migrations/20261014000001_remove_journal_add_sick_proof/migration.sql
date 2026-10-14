-- Hapus tabel jurnal (fitur Jurnal dihapus total dari aplikasi)
DROP TABLE IF EXISTS `journals`;

-- Absensi: tambah kolom bukti sakit (opsional, hanya saat status SAKIT)
ALTER TABLE `attendances` ADD COLUMN `sickProofPath` VARCHAR(191) NULL,
    ADD COLUMN `sickProofName` VARCHAR(191) NULL,
    ADD COLUMN `sickProofMime` VARCHAR(191) NULL;
