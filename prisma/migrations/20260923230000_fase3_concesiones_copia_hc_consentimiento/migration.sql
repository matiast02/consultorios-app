-- AlterTable
ALTER TABLE `ContactRequest` ADD COLUMN `privacyAccepted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `privacyAcceptedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Patient` ADD COLUMN `consentGivenAt` DATETIME(3) NULL,
    ADD COLUMN `consentNote` TEXT NULL,
    ADD COLUMN `consentType` ENUM('WRITTEN', 'VERBAL_RECORDED', 'DIGITAL_SIGNATURE') NULL;

-- CreateTable
CREATE TABLE `ClinicalAccessGrant` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `grantedToUserId` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `decidedById` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `scope` ENUM('FULL', 'PARTIAL') NOT NULL DEFAULT 'FULL',
    `sections` TEXT NULL,
    `entryIds` TEXT NULL,
    `reason` TEXT NOT NULL,
    `consentType` ENUM('WRITTEN', 'VERBAL_RECORDED', 'DIGITAL_SIGNATURE') NULL,
    `consentEvidence` TEXT NULL,
    `consentAt` DATETIME(3) NULL,
    `startsAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClinicalAccessGrant_patientId_idx`(`patientId`),
    INDEX `ClinicalAccessGrant_grantedToUserId_status_idx`(`grantedToUserId`, `status`),
    INDEX `ClinicalAccessGrant_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HcCopyRequest` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `requesterType` ENUM('PATIENT', 'LEGAL_REPRESENTATIVE', 'HEIR', 'EXTERNAL_PROFESSIONAL', 'JUDICIAL') NOT NULL,
    `requesterName` VARCHAR(191) NOT NULL,
    `requesterDni` VARCHAR(191) NULL,
    `authorizationNote` TEXT NULL,
    `reason` TEXT NULL,
    `status` ENUM('PENDING', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `registeredById` VARCHAR(191) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueAt` DATETIME(3) NOT NULL,
    `deliveredAt` DATETIME(3) NULL,
    `deliveredById` VARCHAR(191) NULL,
    `deliveryNote` TEXT NULL,
    `documentHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HcCopyRequest_patientId_idx`(`patientId`),
    INDEX `HcCopyRequest_status_dueAt_idx`(`status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClinicalAccessGrant` ADD CONSTRAINT `ClinicalAccessGrant_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClinicalAccessGrant` ADD CONSTRAINT `ClinicalAccessGrant_grantedToUserId_fkey` FOREIGN KEY (`grantedToUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HcCopyRequest` ADD CONSTRAINT `HcCopyRequest_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

