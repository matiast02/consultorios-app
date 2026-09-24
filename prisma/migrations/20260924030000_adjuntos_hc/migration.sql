-- CreateTable
CREATE TABLE `ClinicalAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `entityType` ENUM('EVOLUTION', 'STUDY_ORDER', 'CLINICAL_RECORD') NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `fileName` TEXT NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `wrappedDek` TEXT NOT NULL,
    `description` TEXT NULL,
    `annulledAt` DATETIME(3) NULL,
    `annulledById` VARCHAR(191) NULL,
    `annulReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClinicalAttachment_storageKey_key`(`storageKey`),
    INDEX `ClinicalAttachment_patientId_entityType_entityId_idx`(`patientId`, `entityType`, `entityId`),
    INDEX `ClinicalAttachment_uploadedById_idx`(`uploadedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClinicalAttachment` ADD CONSTRAINT `ClinicalAttachment_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClinicalAttachment` ADD CONSTRAINT `ClinicalAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

