// Sala de espera (módulo `waiting_room`): número de sala. Ver docs/SALA-DE-ESPERA.md.
// Módulo hoja: no importa otros schemas (lo usan shifts.ts, dashboards.ts y reception.ts).

import { z } from "zod";

export const WaitingTicketSummarySchema = z
  .object({
    id: z.string(),
    number: z
      .number()
      .int()
      .describe("Correlativo diario desde 1. Identifica al paciente en la pantalla de la sala; no promete orden de atención."),
    date: z
      .string()
      .describe("Día del consultorio en formato `YYYY-MM-DD` (America/Argentina/Buenos_Aires), no el del servidor."),
  })
  .openapi({ ref: "WaitingTicket" });

/** Campo `ticket` de las respuestas de llegada (turno y walk-in). */
export const WaitingTicketField = WaitingTicketSummarySchema.nullable().describe(
  "Número de sala emitido (módulo `waiting_room` activo); null con el módulo apagado.",
);
