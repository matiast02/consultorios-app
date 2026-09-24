-- AlterTable
ALTER TABLE `ClinicSettings` ADD COLUMN `reminderChannels` VARCHAR(191) NOT NULL DEFAULT '["EMAIL","WHATSAPP"]',
    ADD COLUMN `reminderHoursBefore` INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN `reminderSecondHoursBefore` INTEGER NULL,
    ADD COLUMN `reminderTemplate` TEXT NULL,
    ADD COLUMN `remindersEnabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Patient` ADD COLUMN `reminderOptOut` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reminderOptOutAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Shift` ADD COLUMN `confirmedAt` DATETIME(3) NULL,
    ADD COLUMN `confirmedVia` VARCHAR(191) NULL,
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE `ShiftReminder` ADD COLUMN `deliveredTo` VARCHAR(191) NULL,
    ADD COLUMN `manual` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `offsetHours` INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN `respondedAt` DATETIME(3) NULL,
    ADD COLUMN `response` VARCHAR(191) NULL,
    ADD COLUMN `tokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `tokenHash` VARCHAR(191) NULL,
    MODIFY `channel` VARCHAR(191) NOT NULL DEFAULT 'EMAIL';

-- CreateIndex
CREATE UNIQUE INDEX `ShiftReminder_tokenHash_key` ON `ShiftReminder`(`tokenHash`);

-- CreateIndex
CREATE UNIQUE INDEX `ShiftReminder_shiftId_offsetHours_key` ON `ShiftReminder`(`shiftId`, `offsetHours`);

