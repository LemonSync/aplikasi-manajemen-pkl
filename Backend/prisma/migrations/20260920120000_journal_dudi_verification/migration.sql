ALTER TABLE `journals`
  ADD COLUMN `dudiVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `dudiVerifiedById` VARCHAR(191) NULL,
  ADD COLUMN `dudiVerificationNote` TEXT NULL,
  ADD INDEX `journals_dudiVerifiedById_idx` (`dudiVerifiedById`),
  ADD CONSTRAINT `journals_dudiVerifiedById_fkey`
    FOREIGN KEY (`dudiVerifiedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
