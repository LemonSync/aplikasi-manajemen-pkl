-- Tabel join many-to-many untuk jurusan yang diawasi admin (role ADMIN).
-- Nama tabel & kolom mengikuti konvensi Prisma untuk relasi implicit many-to-many:
--   A = Major.id, B = User.id (urutan alfabetis nama model: Major < User).
CREATE TABLE `_AdminSupervisedMajors` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    INDEX `_AdminSupervisedMajors_B_index` (`B`),

    PRIMARY KEY (`A`, `B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_AdminSupervisedMajors` ADD CONSTRAINT `_AdminSupervisedMajors_A_fkey` FOREIGN KEY (`A`) REFERENCES `majors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_AdminSupervisedMajors` ADD CONSTRAINT `_AdminSupervisedMajors_B_fkey` FOREIGN KEY (`B`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
