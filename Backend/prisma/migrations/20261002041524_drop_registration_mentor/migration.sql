/*
  Warnings:

  - You are about to drop the column `mentorName` on the `registrations` table. All the data in the column will be lost.
  - You are about to drop the column `mentorPhone` on the `registrations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `registrations` DROP COLUMN `mentorName`,
    DROP COLUMN `mentorPhone`;
