// DTO de recordatorios de turnos (lib/reminders/scheduler.ts): lo que devuelven
// /api/shifts/reminders/**, /api/cron/reminders y el bloque `recordatorios` del
// dashboard de recepción. La forma es la de `reminderToItem` (todos los campos
// presentes), no la de types/index.ts (que los marca opcionales).

import { z } from "zod";
import { reminderChannelEnum } from "@/lib/validations";
import { IsoDateTime } from "../registry";

export const ReminderStatusSchema = z
  .enum(["PENDING", "SENT", "FAILED"])
  .openapi({ ref: "ReminderStatus", description: "PENDING: en cola (o manual sin marcar); SENT: enviado (email o marcado por recepción); FAILED: falló o se invalidó (turno cancelado, opt-out, sin contacto)." });

export const ReminderChannelSchema = reminderChannelEnum.openapi({
  ref: "ReminderChannel",
  description: "EMAIL se envía solo; WHATSAPP es manual (click-to-chat desde recepción); SMS está reservado, hoy no se despacha.",
});

/** Respuesta del paciente desde el link público /turno/<token>. */
export const ReminderResponseSchema = z.enum(["CONFIRMED", "CANCELLED"]).openapi({ ref: "ReminderResponse" });

export const ReminderItemSchema = z
  .object({
    id: z.string(),
    shiftId: z.string(),
    time: z.string().describe('Hora del turno "HH:mm" en hora argentina.').openapi({ example: "10:30" }),
    patientShortName: z.string().describe('"Apellido, Nombre" (solo el primer nombre).'),
    medicShortName: z.string().describe('"Dr. Apellido" / "Dra. Apellido".'),
    medicColor: z.string().nullable().describe("Color de la especialidad del profesional."),
    status: ReminderStatusSchema,
    channel: ReminderChannelSchema,
    offsetHours: z.number().int().describe("Horas de anticipación del recordatorio (24, 2…)."),
    manual: z.boolean().describe("Lo envía recepción a mano (WhatsApp u otro medio) y lo marca con `mark_sent`."),
    waLink: z
      .string()
      .nullable()
      .describe(
        "Link `https://wa.me/<tel>?text=…` con el mensaje prellenado y el link de confirmación. Solo en PENDING manuales de WHATSAPP con teléfono válido y turno futuro; si no, null.",
      ),
    deliveredTo: z.string().nullable().describe("Email o teléfono al que se envió / se va a enviar."),
    response: ReminderResponseSchema.nullable().describe("Qué respondió el paciente desde el link público; null si no respondió."),
    respondedAt: IsoDateTime.nullable(),
    errorMessage: z.string().nullable().describe("Motivo del FAILED (envío fallido, turno cancelado, opt-out, sin contacto, nota de recepción)."),
  })
  .openapi({
    ref: "ReminderItem",
    description: "Recordatorio de un turno visto desde recepción. Sin contenido clínico: el mensaje lleva nombre de pila, fecha, hora, profesional y dirección.",
  });

export const ReminderDispatchSummarySchema = z
  .object({
    planned: z.number().int().describe("Recordatorios creados en esta corrida (uno por turno y anticipación)."),
    sentEmail: z.number().int().describe("Emails enviados con éxito."),
    manualPending: z.number().int().describe("WhatsApp que quedaron manuales (recepción los manda con el `waLink`)."),
    failed: z.number().int().describe("Envíos fallidos o vencidos (el turno empezó sin enviarse)."),
    skippedOptOut: z.number().int().describe("Turnos omitidos porque el paciente pidió no recibir recordatorios."),
    skippedNoContact: z.number().int().describe("Turnos omitidos por no tener email ni WhatsApp válido para los canales habilitados."),
  })
  .openapi({ ref: "ReminderDispatchSummary" });
