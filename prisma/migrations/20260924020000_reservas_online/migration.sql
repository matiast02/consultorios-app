-- AlterTable
ALTER TABLE `ClinicSettings` ADD COLUMN `onlineBookingEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `onlineBookingMaxDaysAhead` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `onlineBookingMinAdvanceHours` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `onlineBookingNotes` TEXT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `acceptsOnlineBooking` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `OnlineBookingRequest` (
    `id` VARCHAR(191) NOT NULL,
    `shiftId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    `requesterFirstName` VARCHAR(191) NOT NULL,
    `requesterLastName` VARCHAR(191) NOT NULL,
    `requesterDni` VARCHAR(191) NOT NULL,
    `requesterPhone` VARCHAR(191) NOT NULL,
    `requesterEmail` VARCHAR(191) NULL,
    `healthInsuranceText` VARCHAR(191) NULL,
    `consultationTypeId` VARCHAR(191) NULL,
    `matchedExisting` BOOLEAN NOT NULL DEFAULT false,
    `tokenHash` VARCHAR(191) NOT NULL,
    `tokenExpiresAt` DATETIME(3) NOT NULL,
    `privacyAcceptedAt` DATETIME(3) NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelledBy` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `emailSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OnlineBookingRequest_shiftId_key`(`shiftId`),
    UNIQUE INDEX `OnlineBookingRequest_tokenHash_key`(`tokenHash`),
    INDEX `OnlineBookingRequest_patientId_idx`(`patientId`),
    INDEX `OnlineBookingRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `OnlineBookingRequest_requesterDni_idx`(`requesterDni`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OnlineBookingRequest` ADD CONSTRAINT `OnlineBookingRequest_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnlineBookingRequest` ADD CONSTRAINT `OnlineBookingRequest_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

