-- Candado de agenda: el profesional decide que solo él (y el admin) modifiquen
-- sus horarios de atención y días bloqueados; la secretaria queda afuera.

-- AlterTable
ALTER TABLE `User` ADD COLUMN `agendaLocked` BOOLEAN NOT NULL DEFAULT false;
