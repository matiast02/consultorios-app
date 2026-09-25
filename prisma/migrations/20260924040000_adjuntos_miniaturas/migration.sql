-- Miniaturas de adjuntos de imagen: clave del objeto cifrado (<patientId>/<id>.thumb.hca)
-- y dimensiones de la imagen original. Null en PDF o si la imagen no se pudo decodificar.

-- AlterTable
ALTER TABLE `ClinicalAttachment` ADD COLUMN `height` INTEGER NULL,
    ADD COLUMN `thumbnailKey` VARCHAR(191) NULL,
    ADD COLUMN `width` INTEGER NULL;
