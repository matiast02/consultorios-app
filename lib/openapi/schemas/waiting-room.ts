// Sala de espera (módulo `waiting_room`): número de sala. Ver docs/SALA-DE-ESPERA.md.
// Módulo hoja: no importa otros schemas (lo usan shifts.ts, dashboards.ts y reception.ts).

import { z } from "zod";
import { IsoDateTime } from "../registry";

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

export const WaitingTicketCalledSchema = z
  .object({
    id: z.string(),
    number: z.number().int(),
    date: z.string(),
    room: z.string().nullable().describe("Consultorio al que se lo llamó (cuerpo del pedido o `defaultRoom` del profesional)."),
    calledAt: IsoDateTime.describe("Primer llamado."),
    lastCalledAt: IsoDateTime.describe("Último llamado (cambia con «volver a llamar»)."),
    callCount: z.number().int().describe("Cantidad de llamados."),
  })
  .openapi({ ref: "WaitingTicketCalled" });

/** Campo `ticket` de las respuestas de llamado. */
export const WaitingTicketCalledField = WaitingTicketCalledSchema.nullable().describe(
  "Ticket llamado (módulo `waiting_room` activo y paciente con número de sala); null si no hay número: nada se muestra en la pantalla.",
);

// ─── Pantalla pública /sala ──────────────────────────────────────────────────

export const WaitingRoomDisplayCallSchema = z
  .object({
    id: z.string().describe("Id del ticket (no identifica a nadie); junto con `callCount` permite detectar un llamado nuevo."),
    number: z.number().int(),
    room: z.string().nullable(),
    calledAt: IsoDateTime.describe("Último llamado."),
    callCount: z.number().int(),
  })
  .openapi({ ref: "WaitingRoomDisplayCall" });

export const WaitingRoomFeedSchema = z
  .object({
    now: IsoDateTime,
    current: WaitingRoomDisplayCallSchema.nullable().describe("Último llamado de los últimos 30 minutos (ticket abierto o ya atendido)."),
    recent: z.array(WaitingRoomDisplayCallSchema).max(4).describe("Los anteriores, del más nuevo al más viejo."),
    waitingCount: z.number().int().describe("Personas con número que todavía no fueron llamadas."),
  })
  .openapi({ ref: "WaitingRoomFeed" });

export const WaitingRoomDisplayKeyStatusSchema = z
  .object({
    configured: z.boolean(),
    createdAt: IsoDateTime.nullable(),
  })
  .openapi({ ref: "WaitingRoomDisplayKeyStatus" });

export const WaitingRoomDisplayKeyCreatedSchema = z
  .object({
    key: z.string().describe("La clave, una sola vez. En la base queda su SHA-256."),
    url: z.string().describe("Link para el televisor: `<base de la app>/sala?k=<clave>`."),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "WaitingRoomDisplayKeyCreated" });
