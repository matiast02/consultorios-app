/*
  Warnings:

  - Added the required column `updatedAt` to the `UserInsurance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `BlockDay` ADD COLUMN `category` ENUM('VACATION', 'HOLIDAY', 'CONFERENCE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    ADD COLUMN `note` TEXT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `bio` TEXT NULL,
    ADD COLUMN `bufferMinutes` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `language` VARCHAR(191) NOT NULL DEFAULT 'es-AR',
    ADD COLUMN `minAdvanceMinutes` INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN `notifyCancellation` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyNewShift` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyReminder24h` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyReminder2h` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifySmsFallback` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyWeeklySummary` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `officeAddress` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `slotDurationMinutes` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    ADD COLUMN `weekStart` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `UserInsurance` ADD COLUMN `copago` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
