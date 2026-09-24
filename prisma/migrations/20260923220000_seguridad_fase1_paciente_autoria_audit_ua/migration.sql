-- AlterTable
ALTER TABLE `AuditLog` MODIFY `userAgent` TEXT NULL;

-- AlterTable
ALTER TABLE `Patient` ADD COLUMN `createdById` VARCHAR(191) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Patient_createdById_idx` ON `Patient`(`createdById`);

