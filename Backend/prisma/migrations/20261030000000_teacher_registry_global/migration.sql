-- Master guru jadi data global: satu daftar guru berlaku di SEMUA gelombang.
-- Baris teacher_registries tetap dipertahankan (tidak ada yang terhapus), hanya
-- ikatan gelombangnya dilepas. Gelombang lama tidak kehilangan guru lagi dan
-- import guru tidak perlu diulang tiap angkatan (beda dengan master siswa).

-- DropForeignKey
ALTER TABLE `teacher_registries` DROP FOREIGN KEY `teacher_registries_cohortId_fkey`;

-- DropIndex
DROP INDEX `teacher_registries_cohortId_idx` ON `teacher_registries`;

-- AlterTable
ALTER TABLE `teacher_registries` DROP COLUMN `cohortId`;
