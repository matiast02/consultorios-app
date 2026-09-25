-- Cobertura con la que se atiende el turno (lib/shift-coverage.ts): obra social
-- aceptada por el profesional, o particular. Turnos anteriores: ambos vacíos.

-- AlterTable
ALTER TABLE `Shift`
    ADD COLUMN `coverageInsuranceId` VARCHAR(191) NULL,
    ADD COLUMN `isPrivate` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `Shift_coverageInsuranceId_idx` ON `Shift`(`coverageInsuranceId`);

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_coverageInsuranceId_fkey` FOREIGN KEY (`coverageInsuranceId`) REFERENCES `HealthInsurance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
