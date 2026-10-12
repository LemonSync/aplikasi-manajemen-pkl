-- ============================================================================
-- Feature F — Refactor PER-ORANG: hilangkan kelompok & akun DUDI,
-- pendaftaran per siswa dengan pemilihan perusahaan (berkuota),
-- pembimbingan per siswa (1 siswa = 1 guru), surat guru (bulk).
-- Dibuat manual (prisma migrate dev tidak stabil) -> npx prisma migrate deploy
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lepas FK yang mengarah ke tabel/kolom yang dirombak
ALTER TABLE `attendances`   DROP FOREIGN KEY `attendances_groupId_fkey`;
ALTER TABLE `complaints`    DROP FOREIGN KEY `complaints_groupId_fkey`;
ALTER TABLE `journals`      DROP FOREIGN KEY `journals_groupId_fkey`;
ALTER TABLE `visits`        DROP FOREIGN KEY `visits_groupId_fkey`;
ALTER TABLE `final_reports` DROP FOREIGN KEY `final_reports_groupId_fkey`;
ALTER TABLE `documents`     DROP FOREIGN KEY `documents_registrationId_fkey`;

-- ---------------------------------------------------------------------------
-- 2. Hapus kolom groupId / relatedGroupId (index turunan ikut terhapus)
ALTER TABLE `attendances`       DROP COLUMN `groupId`;
ALTER TABLE `complaints`        DROP COLUMN `groupId`;
ALTER TABLE `journals`          DROP COLUMN `groupId`;
ALTER TABLE `visits`            DROP COLUMN `groupId`;
ALTER TABLE `final_reports`     DROP COLUMN `groupId`;   -- + unique final_reports_groupId_key
ALTER TABLE `grades`            DROP COLUMN `groupId`;
ALTER TABLE `feedbacks`         DROP COLUMN `groupId`;
ALTER TABLE `generated_letters` DROP COLUMN `relatedGroupId`;

-- ---------------------------------------------------------------------------
-- 3. Jurnal: kolom verifikator DUDI -> verifikator guru
ALTER TABLE `journals` DROP FOREIGN KEY `journals_dudiVerifiedById_fkey`;
ALTER TABLE `journals` DROP INDEX `journals_dudiVerifiedById_idx`;
ALTER TABLE `journals` CHANGE COLUMN `dudiVerifiedAt` `verifiedAt` DATETIME(3) NULL;
ALTER TABLE `journals` CHANGE COLUMN `dudiVerifiedById` `verifiedById` VARCHAR(191) NULL;
ALTER TABLE `journals` CHANGE COLUMN `dudiVerificationNote` `verificationNote` TEXT NULL;
ALTER TABLE `journals` ADD INDEX `journals_verifiedById_idx`(`verifiedById`);
ALTER TABLE `journals` ADD CONSTRAINT `journals_verifiedById_fkey`
    FOREIGN KEY (`verifiedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Hapus tabel kelompok / keanggotaan / DUDI / loker / pendaftaran lama
DROP TABLE IF EXISTS `group_dudi_mentors`;
DROP TABLE IF EXISTS `group_members`;
DROP TABLE IF EXISTS `group_supervisors`;
DROP TABLE IF EXISTS `group_placements`;
DROP TABLE IF EXISTS `groups`;                -- FK groups_registrationId ikut terhapus
DROP TABLE IF EXISTS `registration_members`;
DROP TABLE IF EXISTS `company_mentors`;
DROP TABLE IF EXISTS `job_vacancies`;
DROP TABLE `registrations`;

-- ---------------------------------------------------------------------------
-- 5. Tabel baru: pembimbingan per siswa (1 siswa = 1 guru pembimbing)
CREATE TABLE `student_supervisors` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `supervisorId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `student_supervisors_studentId_key`(`studentId`),
    INDEX `student_supervisors_supervisorId_idx`(`supervisorId`),

    CONSTRAINT `student_supervisors_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `student_supervisors_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. Perusahaan: kuota maksimal siswa PKL (null = tanpa batas)
ALTER TABLE `companies` ADD COLUMN `quota` INTEGER NULL;

-- ---------------------------------------------------------------------------
-- 7. Pendaftaran baru (per siswa + pilihan perusahaan, tanpa snapshot teks)
CREATE TABLE `registrations` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `cohortId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `majorId` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'DIAJUKAN', 'DISETUJUI', 'DITOLAK') NOT NULL DEFAULT 'DRAFT',
    `note` TEXT NULL,
    `permohonanDownloadedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `registrations_code_key`(`code`),
    UNIQUE INDEX `registrations_studentId_cohortId_key`(`studentId`, `cohortId`),
    INDEX `registrations_cohortId_idx`(`cohortId`),
    INDEX `registrations_studentId_idx`(`studentId`),
    INDEX `registrations_companyId_idx`(`companyId`),
    INDEX `registrations_status_idx`(`status`),
    INDEX `registrations_majorId_fkey`(`majorId`),
    INDEX `registrations_reviewedById_fkey`(`reviewedById`),

    CONSTRAINT `registrations_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `registrations_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `registrations_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `registrations_majorId_fkey` FOREIGN KEY (`majorId`) REFERENCES `majors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `registrations_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. Laporan akhir: per kelompok -> per siswa
ALTER TABLE `final_reports` ADD COLUMN `studentId` VARCHAR(191) NOT NULL;
ALTER TABLE `final_reports` ADD UNIQUE INDEX `final_reports_studentId_key`(`studentId`);
ALTER TABLE `final_reports` ADD CONSTRAINT `final_reports_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. Kunjungan: target per siswa (perusahaan tetap opsional)
ALTER TABLE `visits` ADD COLUMN `studentId` VARCHAR(191) NULL;
ALTER TABLE `visits` ADD INDEX `visits_studentId_idx`(`studentId`);
ALTER TABLE `visits` ADD CONSTRAINT `visits_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 10. Surat: pencatat penerbit (guru/admin)
ALTER TABLE `generated_letters` ADD COLUMN `createdById` VARCHAR(191) NULL;
ALTER TABLE `generated_letters` ADD INDEX `generated_letters_createdById_idx`(`createdById`);
ALTER TABLE `generated_letters` ADD CONSTRAINT `generated_letters_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 11. Dokumen: pasang ulang FK ke tabel registrations yang baru
ALTER TABLE `documents` ADD CONSTRAINT `documents_registrationId_fkey`
    FOREIGN KEY (`registrationId`) REFERENCES `registrations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 12. Enum DocumentType: SURAT_MONITORING & SURAT_PENJEMPUTAN
--     menggantikan SURAT_PENUGASAN & SURAT_PENARIKAN
ALTER TABLE `documents` MODIFY COLUMN `type`
    ENUM('SURAT_PERMOHONAN', 'SURAT_PENGANTAR', 'SURAT_PENERIMAAN', 'SURAT_PERNYATAAN',
         'SURAT_MONITORING', 'LAPORAN_AKHIR', 'SURAT_PENJEMPUTAN', 'LAINNYA') NOT NULL;
ALTER TABLE `generated_letters` MODIFY COLUMN `type`
    ENUM('SURAT_PERMOHONAN', 'SURAT_PENGANTAR', 'SURAT_PENERIMAAN', 'SURAT_PERNYATAAN',
         'SURAT_MONITORING', 'LAPORAN_AKHIR', 'SURAT_PENJEMPUTAN', 'LAINNYA') NOT NULL;
