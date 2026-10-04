CREATE TABLE `group_dudi_mentors` (
  `id` VARCHAR(191) NOT NULL,
  `groupId` VARCHAR(191) NOT NULL,
  `dudiUserId` VARCHAR(191) NOT NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT false,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `group_dudi_mentors_groupId_dudiUserId_key`(`groupId`, `dudiUserId`),
  INDEX `group_dudi_mentors_dudiUserId_idx`(`dudiUserId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `group_dudi_mentors_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `group_dudi_mentors_dudiUserId_fkey` FOREIGN KEY (`dudiUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
