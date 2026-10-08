-- Status monitoring guru pembimbing + bukti foto
ALTER TABLE `visits` ADD COLUMN `status` ENUM('TERJADWAL', 'TERTUNDA', 'BATAL', 'SELESAI') NOT NULL DEFAULT 'TERJADWAL';
ALTER TABLE `visits` ADD COLUMN `photoPath` VARCHAR(191) NULL;
ALTER TABLE `visits` ADD COLUMN `photoName` VARCHAR(191) NULL;

-- Kunjungan lama yang sudah pernah dilakukan dianggap selesai
UPDATE `visits` SET `status` = 'SELESAI' WHERE `visitedAt` IS NOT NULL;

-- Tabel laporan hasil akhir PKL per kelompok (PDF, diterbitkan satu kali)
CREATE TABLE `final_reports` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `cohortId` VARCHAR(191) NULL,
    `pdfPath` VARCHAR(191) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `final_reports_groupId_key`(`groupId`),
    INDEX `final_reports_cohortId_idx`(`cohortId`),

    CONSTRAINT `final_reports_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `final_reports_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
