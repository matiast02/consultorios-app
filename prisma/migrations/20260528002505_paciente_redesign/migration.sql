-- Paciente redesign: emergency contact on Patient, anthropometry +
-- structured habits + structured allergies on ClinicalRecord, durationDays on Prescription.

ALTER TABLE `Patient`
  ADD COLUMN `emergencyContactName`  VARCHAR(191) NULL,
  ADD COLUMN `emergencyContactPhone` VARCHAR(191) NULL;

ALTER TABLE `ClinicalRecord`
  ADD COLUMN `heightCm`            INT          NULL,
  ADD COLUMN `weightKg`            DECIMAL(5,2) NULL,
  ADD COLUMN `habitsTobacco`       TEXT         NULL,
  ADD COLUMN `habitsAlcohol`       TEXT         NULL,
  ADD COLUMN `habitsActivity`      TEXT         NULL,
  ADD COLUMN `habitsDiet`          TEXT         NULL,
  ADD COLUMN `structuredAllergies` TEXT         NULL;

ALTER TABLE `Prescription`
  ADD COLUMN `durationDays` INT NOT NULL DEFAULT 90;
