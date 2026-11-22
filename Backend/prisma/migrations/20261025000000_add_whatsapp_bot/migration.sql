-- Bot WhatsApp: grup per gelombang, pohon panduan CS, log pengingat fase, log percakapan.
-- Hanya tabel baru (non-destruktif); pernyataan drift lain yang ikut muncul di
-- `prisma migrate diff` (DROP PRIMARY KEY _AdminSupervisedMajors, MODIFY letter_signatories)
-- sengaja tidak dimasukkan karena bukan bagian fitur ini.

-- CreateTable
CREATE TABLE `wa_groups` (
    `id` VARCHAR(191) NOT NULL,
    `cohortId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(60) NOT NULL,
    `subject` VARCHAR(120) NOT NULL,
    `invite` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wa_groups_cohortId_key`(`cohortId`),
    UNIQUE INDEX `wa_groups_jid_key`(`jid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_guides` (
    `id` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'SISWA',
    `rowId` VARCHAR(60) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `body` TEXT NULL,
    `imagePath` VARCHAR(255) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wa_guides_rowId_key`(`rowId`),
    INDEX `wa_guides_parentId_idx`(`parentId`),
    INDEX `wa_guides_role_isActive_idx`(`role`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_reminder_logs` (
    `id` VARCHAR(191) NOT NULL,
    `cohortId` VARCHAR(191) NOT NULL,
    `phase` ENUM('PRA_PKL', 'NON_PKL', 'PKL_AKTIF', 'PKL_SELESAI') NOT NULL,
    `kind` VARCHAR(20) NOT NULL DEFAULT 'START',
    `dayKey` VARCHAR(10) NOT NULL,
    `ok` BOOLEAN NOT NULL,
    `detail` TEXT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wa_reminder_logs_dayKey_idx`(`dayKey`),
    UNIQUE INDEX `wa_reminder_logs_cohortId_phase_kind_dayKey_key`(`cohortId`, `phase`, `kind`, `dayKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_message_logs` (
    `id` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(3) NOT NULL,
    `chatJid` VARCHAR(60) NOT NULL,
    `senderJid` VARCHAR(60) NULL,
    `kind` VARCHAR(40) NULL,
    `body` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wa_message_logs_chatJid_createdAt_idx`(`chatJid`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wa_groups` ADD CONSTRAINT `wa_groups_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wa_guides` ADD CONSTRAINT `wa_guides_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `wa_guides`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
