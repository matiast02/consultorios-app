-- Módulo «Sala de espera y llamado» (waiting_room). Ver docs/SALA-DE-ESPERA.md.

-- CreateTable
CREATE TABLE `WaitingTicket` (
    `id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `shiftId` VARCHAR(191) NULL,
    `walkInId` VARCHAR(191) NULL,
    `medicId` VARCHAR(191) NULL,
    `room` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `calledAt` DATETIME(3) NULL,
    `lastCalledAt` DATETIME(3) NULL,
    `callCount` INTEGER NOT NULL DEFAULT 0,
    `closedAt` DATETIME(3) NULL,
    `closedReason` VARCHAR(191) NULL,

    UNIQUE INDEX `WaitingTicket_shiftId_key`(`shiftId`),
    UNIQUE INDEX `WaitingTicket_walkInId_key`(`walkInId`),
    INDEX `WaitingTicket_date_calledAt_idx`(`date`, `calledAt`),
    UNIQUE INDEX `WaitingTicket_date_number_key`(`date`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WaitingTicket` ADD CONSTRAINT `WaitingTicket_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WaitingTicket` ADD CONSTRAINT `WaitingTicket_walkInId_fkey` FOREIGN KEY (`walkInId`) REFERENCES `WalkInArrival`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Clave de la pantalla pública /sala (solo el hash; la clave se muestra una vez al admin)
ALTER TABLE `ClinicSettings`
    ADD COLUMN `waitingRoomDisplayKeyHash` VARCHAR(191) NULL,
    ADD COLUMN `waitingRoomDisplayKeyCreatedAt` DATETIME(3) NULL;

-- El módulo existe en toda instancia, apagado por defecto (el seed lo repite para bases nuevas)
INSERT INTO `ModuleConfig` (`id`, `module`, `name`, `enabled`, `createdAt`, `updatedAt`)
SELECT 'mod_waiting_room', 'waiting_room', 'Sala de espera y llamado', false, NOW(3), NOW(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `ModuleConfig` WHERE `module` = 'waiting_room');
