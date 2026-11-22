-- Fase 4: penilaian sekolah (butir LEMBARAN PENILAIAN) + sertifikat PKL
-- Hanya perubahan milik fase 4. Drift yang sudah ada sebelumnya
-- (_adminsupervisedmajors PRIMARY KEY, letter_signatories.signaturePath) sengaja
-- TIDAK ikut disertakan di sini.

-- AlterTable: butir penilaian terkunci + komponen nilai laporan + mentor perusahaan
ALTER TABLE `grades`
    ADD COLUMN `mentorName` VARCHAR(120) NULL,
    ADD COLUMN `scoreReport` DECIMAL(5, 2) NULL,
    ADD COLUMN `submittedAt` DATETIME(3) NULL;

-- AlterTable: identitas butir tetap pada LEMBARAN PENILAIAN sekolah
ALTER TABLE `grade_aspects`
    ADD COLUMN `code` VARCHAR(8) NULL,
    ADD COLUMN `groupCode` VARCHAR(2) NULL;

-- CreateTable
CREATE TABLE `certificates` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `cohortId` VARCHAR(191) NULL,
    `number` VARCHAR(80) NOT NULL,
    `numberSource` VARCHAR(12) NOT NULL DEFAULT 'SISTEM',
    `logoPath` VARCHAR(191) NOT NULL,
    `logoName` VARCHAR(191) NULL,
    `pdfPath` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `certificates_studentId_key` ON `certificates`(`studentId`);

-- CreateIndex
CREATE UNIQUE INDEX `certificates_number_key` ON `certificates`(`number`);

-- CreateIndex
CREATE INDEX `certificates_cohortId_idx` ON `certificates`(`cohortId`);

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
