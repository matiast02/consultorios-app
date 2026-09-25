-- AlterTable
ALTER TABLE `AuditLog` ADD COLUMN `hash` TEXT NULL,
    ADD COLUMN `prevHash` TEXT NULL;

-- AlterTable
ALTER TABLE `Evolution` ADD COLUMN `annulReason` TEXT NULL,
    ADD COLUMN `annulledAt` DATETIME(3) NULL,
    ADD COLUMN `annulledById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MealPlan` ADD COLUMN `annulReason` TEXT NULL,
    ADD COLUMN `annulledAt` DATETIME(3) NULL,
    ADD COLUMN `annulledById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Prescription` ADD COLUMN `annulReason` TEXT NULL,
    ADD COLUMN `annulledAt` DATETIME(3) NULL,
    ADD COLUMN `annulledById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `StudyOrder` ADD COLUMN `annulReason` TEXT NULL,
    ADD COLUMN `annulledAt` DATETIME(3) NULL,
    ADD COLUMN `annulledById` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ClinicalEntryVersion` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `data` TEXT NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `contentHash` VARCHAR(191) NOT NULL,
    `prevHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClinicalEntryVersion_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `ClinicalEntryVersion_patientId_idx`(`patientId`),
    UNIQUE INDEX `ClinicalEntryVersion_entityType_entityId_version_key`(`entityType`, `entityId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
