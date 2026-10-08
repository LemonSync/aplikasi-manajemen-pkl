-- Gerbang Fase 1 -> Fase 2: tandai kapan ketua mengunduh Surat Permohonan
ALTER TABLE `registrations` ADD COLUMN `permohonanDownloadedAt` DATETIME(3) NULL;

-- Backfill: pendaftaran yang sudah DISETUJUI sebelum fitur ini ada dianggap
-- sudah melewati tahap unduh (data lama tidak boleh terkunci di Fase 1)
UPDATE `registrations`
SET `permohonanDownloadedAt` = `updatedAt`
WHERE `status` = 'DISETUJUI' AND `permohonanDownloadedAt` IS NULL;
