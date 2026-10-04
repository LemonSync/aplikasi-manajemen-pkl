-- AlterTable
ALTER TABLE `registrations` ADD COLUMN `companyWebsite` VARCHAR(255) NULL,
                           ADD COLUMN `companyContacts` JSON NULL;

-- AlterTable
ALTER TABLE `attendances` ADD COLUMN `activity` LONGTEXT NULL,
                         ADD COLUMN `verifiedById` VARCHAR(191) NULL,
                         ADD COLUMN `verifiedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `phase_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `cohortId` VARCHAR(191) NOT NULL,
    `phase` ENUM('PRA_PKL', 'NON_PKL', 'PKL_AKTIF', 'PKL_SELESAI') NOT NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `phase_schedules_cohortId_phase_key`(`cohortId`, `phase`),
    INDEX `phase_schedules_cohortId_idx`(`cohortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `Attendance_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phase_schedules` ADD CONSTRAINT `phase_schedules_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;