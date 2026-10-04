CREATE TABLE `student_registries` (
  `id` VARCHAR(191) NOT NULL, `nisn` VARCHAR(10) NOT NULL, `fullName` VARCHAR(191) NOT NULL,
  `className` VARCHAR(60) NOT NULL, `cohortId` VARCHAR(191) NOT NULL, `majorId` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL, UNIQUE INDEX `student_registries_nisn_key`(`nisn`),
  INDEX `student_registries_cohortId_idx`(`cohortId`), INDEX `student_registries_className_idx`(`className`), PRIMARY KEY (`id`),
  CONSTRAINT `student_registries_cohortId_fkey` FOREIGN KEY (`cohortId`) REFERENCES `cohorts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `student_registries_majorId_fkey` FOREIGN KEY (`majorId`) REFERENCES `majors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
