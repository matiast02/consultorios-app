// Notificaciones: /api/notifications/**.
// Mezcla de notificaciones CALCULADAS al momento (id "generated-…", no se
// persisten) y PERSISTIDAS en la tabla Notification (reservas online y
// cancelaciones del paciente). Hoy la app las obtiene por polling.

import { z } from "zod";
import { defineRoutes, errors, IdParam, IsoDateTime, ok, TAGS } from "../registry";

export const AppNotificationSchema = z
  .object({
    id: z
      .string()
      .describe('Persistidas: cuid. Calculadas: "generated-daily-summary", "generated-new-contact-requests", "generated-pending-studies", "generated-rescheduled-<shiftId>", "generated-inactive-<patientId>".'),
    type: z
      .string()
      .describe(
        "Calculadas: `daily_summary`, `new_contact_requests`, `pending_studies`, `rescheduled`, `inactive_patient`. Persistidas: `online_booking`, `online_booking_cancelled` (y las que se agreguen).",
      )
      .openapi({ example: "rescheduled" }),
    title: z.string(),
    message: z.string().describe("Texto en español listo para mostrar. Sin contenido clínico."),
    resourceId: z
      .string()
      .nullable()
      .describe("Según `type`: id del turno (`rescheduled`, `online_booking*` para el médico), del paciente (`inactive_patient`) o de la reserva (`online_booking*` para recepción). null en los resúmenes."),
    read: z.boolean().describe("Las calculadas vienen siempre `false`; las persistidas solo se listan mientras están sin leer."),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "AppNotification" });

export const NotificationsResponseSchema = z
  .object({
    notifications: z.array(AppNotificationSchema).describe("`daily_summary` primero; el resto por `createdAt` descendente."),
    count: z.number().int(),
  })
  .openapi({ ref: "NotificationsResponse" });

/** Respuesta de marcar como leída: mínima para las calculadas, la fila completa para las persistidas. */
export const NotificationReadResultSchema = z
  .object({
    id: z.string(),
    read: z.literal(true),
    userId: z.string().optional().describe("Solo en notificaciones persistidas."),
    type: z.string().optional(),
    title: z.string().optional(),
    message: z.string().optional(),
    resourceId: z.string().nullable().optional(),
    createdAt: IsoDateTime.optional(),
  })
  .openapi({
    ref: "NotificationReadResult",
    description: "Para ids `generated-…` solo vienen `id` y `read`; para las persistidas, la notificación completa.",
  });

export const notificationsRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/notifications",
    summary: "Notificaciones del usuario logueado",
    description: [
      "Cualquier rol. Calcula al momento, según el rol: resumen de turnos de hoy (`daily_summary`), turnos reprogramados en las últimas 48 h (hasta 10), órdenes de estudio pendientes, pacientes sin turnos hace más de 90 días (hasta 5) y, solo para recepción/admin, solicitudes de contacto nuevas de la web.",
      "El médico ve solo lo propio (sus turnos, sus órdenes, sus pacientes); secretaria y admin ven lo de todo el consultorio.",
      "Suma las notificaciones persistidas sin leer de los últimos 14 días (hasta 20): reservas online nuevas y canceladas por el paciente.",
    ].join("\n\n"),
    tags: [TAGS.notifications],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Notificaciones y cantidad.", schema: ok(NotificationsResponseSchema) },
      ...errors(401),
    },
  },
  {
    method: "put",
    path: "/api/notifications/{id}/read",
    summary: "Marcar una notificación como leída",
    description:
      "Cualquier rol. Con un id `generated-…` no persiste nada (responde 200 con `{ id, read: true }`: la calculada va a reaparecer mientras la condición siga). Con una persistida, la marca leída y deja de aparecer en el listado; solo la puede marcar su destinatario. Sin body.",
    tags: [TAGS.notifications],
    auth: { kind: "session" },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Marcada como leída.", schema: ok(NotificationReadResultSchema) },
      ...errors(401, { 403: "La notificación es de otro usuario." }, 404),
    },
  },
]);
