-- DropForeignKey
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_userId_fkey`;

-- DropIndex
DROP INDEX `Account_provider_providerAccountId_key` ON `Account`;

-- DropIndex
DROP INDEX `Session_sessionToken_key` ON `Session`;

-- AlterTable
ALTER TABLE `Account` DROP COLUMN `access_token`,
    DROP COLUMN `expires_at`,
    DROP COLUMN `id_token`,
    DROP COLUMN `provider`,
    DROP COLUMN `providerAccountId`,
    DROP COLUMN `refresh_token`,
    DROP COLUMN `session_state`,
    DROP COLUMN `token_type`,
    DROP COLUMN `type`,
    ADD COLUMN `accessToken` TEXT NULL,
    ADD COLUMN `accessTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `accountId` VARCHAR(191) NOT NULL,
    ADD COLUMN `idToken` TEXT NULL,
    ADD COLUMN `password` TEXT NULL,
    ADD COLUMN `providerId` VARCHAR(191) NOT NULL,
    ADD COLUMN `refreshToken` TEXT NULL,
    ADD COLUMN `refreshTokenExpiresAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `AuditLog` MODIFY `userId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Session` DROP COLUMN `expires`,
    DROP COLUMN `sessionToken`,
    ADD COLUMN `expiresAt` DATETIME(3) NOT NULL,
    ADD COLUMN `ipAddress` VARCHAR(191) NULL,
    ADD COLUMN `token` VARCHAR(191) NOT NULL,
    ADD COLUMN `userAgent` TEXT NULL;

-- AlterTable
ALTER TABLE `Shift` ADD COLUMN `arrivedAt` DATETIME(3) NULL,
    ADD COLUMN `consultationStartedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Specialization` ADD COLUMN `color` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `password`,
    ADD COLUMN `defaultRoom` VARCHAR(191) NULL,
    MODIFY `name` VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY `email` VARCHAR(191) NOT NULL,
    DROP COLUMN `emailVerified`,
    ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `UserInsurance` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- DropTable
DROP TABLE `VerificationToken`;

-- CreateTable
CREATE TABLE `Verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Verification_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShiftReminder` (
    `id` VARCHAR(191) NOT NULL,
    `shiftId` VARCHAR(191) NOT NULL,
    `scheduledFor` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `channel` VARCHAR(191) NOT NULL DEFAULT 'email',
    `sentAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShiftReminder_shiftId_idx`(`shiftId`),
    INDEX `ShiftReminder_status_scheduledFor_idx`(`status`, `scheduledFor`),
    INDEX `ShiftReminder_scheduledFor_idx`(`scheduledFor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalkInArrival` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `telephone` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `arrivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `assignedShiftId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WalkInArrival_patientId_idx`(`patientId`),
    INDEX `WalkInArrival_assignedShiftId_idx`(`assignedShiftId`),
    INDEX `WalkInArrival_arrivedAt_idx`(`arrivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClinicSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `name` VARCHAR(191) NULL,
    `tagline` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `whatsappPrimary` VARCHAR(191) NULL,
    `whatsappSecondary` VARCHAR(191) NULL,
    `phoneDisplay` VARCHAR(191) NULL,
    `prefillWhatsappMessage` TEXT NULL,
    `addressLine1` VARCHAR(191) NULL,
    `addressLine2` VARCHAR(191) NULL,
    `mapLat` DECIMAL(9, 6) NULL,
    `mapLng` DECIMAL(9, 6) NULL,
    `mapZoom` INTEGER NULL DEFAULT 16,
    `showTeam` BOOLEAN NOT NULL DEFAULT true,
    `showHours` BOOLEAN NOT NULL DEFAULT true,
    `showMap` BOOLEAN NOT NULL DEFAULT true,
    `showContactForm` BOOLEAN NOT NULL DEFAULT true,
    `yearsOfService` INTEGER NULL,
    `patientsServedDisplay` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClinicHours` (
    `id` VARCHAR(191) NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `closed` BOOLEAN NOT NULL DEFAULT false,
    `amOpen` VARCHAR(191) NULL,
    `amClose` VARCHAR(191) NULL,
    `pmOpen` VARCHAR(191) NULL,
    `pmClose` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClinicHours_dayOfWeek_key`(`dayOfWeek`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactRequest` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `healthInsurance` VARCHAR(191) NULL,
    `specializationId` VARCHAR(191) NULL,
    `preferredDay` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'new',
    `whatsappOpened` BOOLEAN NOT NULL DEFAULT false,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    INDEX `ContactRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `ContactRequest_specializationId_idx`(`specializationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Account_providerId_accountId_key` ON `Account`(`providerId`, `accountId`);

-- CreateIndex
CREATE UNIQUE INDEX `Session_token_key` ON `Session`(`token`);

-- CreateIndex
CREATE INDEX `Shift_arrivedAt_idx` ON `Shift`(`arrivedAt`);

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShiftReminder` ADD CONSTRAINT `ShiftReminder_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalkInArrival` ADD CONSTRAINT `WalkInArrival_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalkInArrival` ADD CONSTRAINT `WalkInArrival_assignedShiftId_fkey` FOREIGN KEY (`assignedShiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContactRequest` ADD CONSTRAINT `ContactRequest_specializationId_fkey` FOREIGN KEY (`specializationId`) REFERENCES `Specialization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

