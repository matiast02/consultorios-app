// DTO compartidos del módulo de agenda del registro OpenAPI: horarios de
// atención por día (`UserPreference`), días bloqueados (`BlockDay`) y el
// resultado del bloqueo con reprogramación automática.
//
// La forma es la que DEVUELVEN las rutas (registros Prisma completos).

import { z } from "zod";
import { blockDayCategoryEnum } from "@/lib/validations";
import { IsoDateTime } from "../registry";

/** Horario de atención de un profesional para un día de la semana (franjas AM y PM en HH:mm). */
export const UserPreferenceSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    day: z.number().int().min(0).max(6).describe("0 = domingo … 6 = sábado."),
    fromHourAM: z.string().nullable().describe("HH:mm; null si no atiende a la mañana."),
    toHourAM: z.string().nullable(),
    fromHourPM: z.string().nullable().describe("HH:mm; null si no atiende a la tarde."),
    toHourPM: z.string().nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "UserPreference" });

export const BlockDayCategorySchema = blockDayCategoryEnum.openapi({ ref: "BlockDayCategory" });

export const BlockDaySchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    date: IsoDateTime.describe("Medianoche UTC del día bloqueado (se crea con `new Date(\"YYYY-MM-DD\")`)."),
    category: BlockDayCategorySchema,
    note: z.string().nullable(),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "BlockDay" });

/** GET /api/preferences: horarios + todos los días bloqueados del profesional. */
export const UserPreferencesAndBlockDaysSchema = z
  .object({
    preferences: z.array(UserPreferenceSchema).describe("Un registro por día configurado, ordenados por `day`."),
    blockDays: z.array(BlockDaySchema).describe("Todos, sin filtro de fecha, ordenados por `date`."),
  })
  .openapi({ ref: "UserPreferencesAndBlockDays" });

export const RescheduledShiftSchema = z
  .object({
    shiftId: z.string(),
    patient: z.string().describe('"Apellido, Nombre" del paciente.'),
    originalDate: IsoDateTime.describe("Inicio original del turno."),
    newDate: IsoDateTime.describe("Nuevo inicio (misma hora, mismo día de la semana)."),
    originalTime: z.string().describe("HH:mm del turno (se conserva)."),
  })
  .openapi({ ref: "RescheduledShift" });

export const BlockDaysResultSchema = z
  .object({
    created: z.number().int().describe("Días bloqueados creados; las fechas que ya estaban bloqueadas se ignoran."),
    rescheduledShifts: z
      .array(RescheduledShiftSchema)
      .describe("Turnos que se movieron automáticamente. Los que no encontraron lugar no aparecen y quedan en el día bloqueado."),
  })
  .openapi({ ref: "BlockDaysResult" });
