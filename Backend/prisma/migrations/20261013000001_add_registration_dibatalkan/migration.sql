-- Tambah status DIBATALKAN: siswa berubah pikiran/ganti perusahaan (kuota perusahaan lama otomatis dilepas)
ALTER TABLE `registrations` MODIFY `status` ENUM('DRAFT', 'DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'DIBATALKAN') NOT NULL DEFAULT 'DRAFT';
