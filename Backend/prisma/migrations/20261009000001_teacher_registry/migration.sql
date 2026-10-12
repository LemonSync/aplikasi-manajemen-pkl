CREATE TABLE `teacher_registries` (
  `id` VARCHAR(191) NOT NULL, `nip` VARCHAR(18) NOT NULL, `fullName` VARCHAR(191) NOT NULL,
  `cohortId` VARCHAR(191) NOT NULL, `majorId` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL, UNIQUE INDEX `teacher_registries_nip_key`(`nip`),
  INDEX `teacher_registries_cohortId_idx`(`cohortId`), PRIMARY KEY (`id`),
  CONSTRAINT `teacher_registries_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `teacher_registries_majorId_fkey` FOREIGN KEY (`majorId`) REFERENCES `majors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
