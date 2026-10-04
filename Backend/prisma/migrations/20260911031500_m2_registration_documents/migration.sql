-- AlterTable
ALTER TABLE `documents` ADD COLUMN `registrationId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `groups` ADD COLUMN `registrationId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `registrations` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `groupName` VARCHAR(191) NOT NULL,
    `cohortId` VARCHAR(191) NOT NULL,
    `leaderId` VARCHAR(191) NOT NULL,
    `majorId` VARCHAR(191) NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `companyAddress` TEXT NOT NULL,
    `companyIndustry` VARCHAR(191) NULL,
    `companyPhone` VARCHAR(30) NULL,
    `companyCity` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'DIAJUKAN', 'DISETUJUI', 'DITOLAK') NOT NULL DEFAULT 'DRAFT',
    `note` TEXT NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `registrations_code_key`(`code`),
    INDEX `registrations_cohortId_idx`(`cohortId`),
    INDEX `registrations_leaderId_idx`(`leaderId`),
    INDEX `registrations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registration_members` (
    `id` VARCHAR(191) NOT NULL,
    `registrationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `nisn` VARCHAR(30) NULL,
    `className` VARCHAR(60) NULL,
    `phone` VARCHAR(30) NULL,
    `address` TEXT NULL,
    `isLeader` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `registration_members_registrationId_idx`(`registrationId`),
    INDEX `registration_members_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `documents_registrationId_key` ON `documents`(`registrationId`);

-- CreateIndex
CREATE UNIQUE INDEX `groups_registrationId_key` ON `groups`(`registrationId`);

-- AddForeignKey
ALTER TABLE `groups` ADD CONSTRAINT `groups_registrationId_fkey` FOREIGN KEY (`registrationId`) REFERENCES `registrations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_leaderId_fkey` FOREIGN KEY (`leaderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_majorId_fkey` FOREIGN KEY (`majorId`) REFERENCES `majors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registration_members` ADD CONSTRAINT `registration_members_registrationId_fkey` FOREIGN KEY (`registrationId`) REFERENCES `registrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registration_members` ADD CONSTRAINT `registration_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_registrationId_fkey` FOREIGN KEY (`registrationId`) REFERENCES `registrations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
