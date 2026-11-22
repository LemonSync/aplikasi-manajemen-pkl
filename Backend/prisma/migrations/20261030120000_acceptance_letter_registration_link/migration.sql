-- Surat Penerimaan harus bisa diikat ke "ronde" pendaftaran tertentu:
--  1. Status TIDAK_BERLAKU untuk dokumen yang dibatalkan sistem (siswa ganti
--     perusahaan) sehingga tidak lagi dihitung gerbang fase maupun inbox.
--  2. registrationId tidak lagi UNIQUE — satu baris pendaftaran (satu baris per
--     siswa+gelombang, dipakai ulang saat ganti perusahaan) dapat menyimpan
--     beberapa dokumen (surat permohonan + beberapa ronde surat penerimaan).

ALTER TABLE `documents`
  MODIFY COLUMN `status`
  ENUM('DRAFT', 'DIUNGGAH', 'MENUNGGU_VERIFIKASI', 'DISETUJUI', 'DITOLAK', 'TIDAK_BERLAKU')
  NOT NULL DEFAULT 'DRAFT';

-- Indeks pengganti dibuat lebih dulu: MySQL menolak melepas unique index yang
-- masih dipakai FK documents_registrationId_fkey.
CREATE INDEX `documents_registrationId_idx` ON `documents`(`registrationId`);

DROP INDEX `documents_registrationId_key` ON `documents`;
