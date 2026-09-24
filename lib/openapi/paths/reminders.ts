// Recordatorios: /api/shifts/reminders/**, /api/cron/reminders.
// Ciclo: planificar (crear los ShiftReminder que faltan) + despachar (EMAIL se
// envía; WHATSAPP queda manual con `waLink` para que recepción lo mande y lo
// marque). Ni los mensajes ni el link público /turno/<token> llevan contenido clínico.

import { z } from "zod";
import { reminderActionSchema } from "@/lib/validations";
import { defineRoutes, errors, IdParam, IsoDate, ok, TAGS } from "../registry";
import { ReminderDispatchSummarySchema, ReminderItemSchema } from "../schemas/reminders";

const receptionOnly = "Recepción (secretaria) o admin; los médicos reciben 403.";

const cycleDescription = [
  "**Planificar**: crea los recordatorios que faltan para los turnos PENDING/CONFIRMED que empiezan dentro de la ventana [ahora, ahora + mayor anticipación configurada + 1 h], uno por anticipación (24 h y opcionalmente una segunda). Idempotente. Omite pacientes con opt-out o sin contacto válido.",
  "**Despachar**: procesa los PENDING cuya hora de envío ya pasó (hasta 200 por corrida). EMAIL → se envía (SENT / FAILED); WHATSAPP → queda PENDING y `manual: true` con el `waLink` listo. Los de turnos cancelados o ya empezados pasan a FAILED.",
  "Si `remindersEnabled` está apagado en la configuración del consultorio no hace nada y devuelve todo en cero.",
].join("\n\n");

export const remindersRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/shifts/reminders",
    summary: "Listar recordatorios de los turnos de una fecha",
    description: [
      `${receptionOnly}`,
      "Devuelve TODOS los recordatorios (cualquier estado y anticipación) de los turnos que empiezan ese día en hora argentina; por defecto **mañana**. Orden: hora del turno y luego mayor anticipación primero.",
      "Para los WhatsApp manuales pendientes calcula el `waLink` con el mensaje y el link de confirmación (token estable: recalcularlo no invalida el ya enviado).",
    ].join("\n\n"),
    tags: [TAGS.reminders],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    request: {
      query: z.object({
        date: IsoDate.optional().describe("Día de los turnos (hora argentina). Default: mañana."),
      }),
    },
    responses: {
      200: { description: "Recordatorios del día.", schema: ok(z.array(ReminderItemSchema)) },
      ...errors({ 400: "Fecha inválida (formato YYYY-MM-DD o día inexistente)." }, 401, 403),
    },
  },
  {
    method: "post",
    path: "/api/shifts/reminders",
    summary: "Planificar recordatorios (crear los que faltan, sin enviar)",
    description: `${receptionOnly}\n\nSolo la fase de **planificar** del ciclo (ver \`POST /api/shifts/reminders/send\`). No envía nada: \`sentEmail\`, \`manualPending\` y \`failed\` vienen siempre en 0. Sin body.`,
    tags: [TAGS.reminders],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    responses: {
      200: { description: "Resumen de la planificación.", schema: ok(ReminderDispatchSummarySchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "post",
    path: "/api/shifts/reminders/send",
    summary: "Planificar y enviar los recordatorios vencidos",
    description: `${receptionOnly}\n\nBotón "Enviar" de recepción: corre el ciclo completo (mismo que el cron).\n\n${cycleDescription}\n\nEnvía emails reales a los pacientes. Un lock por recordatorio evita el doble envío si coincide con el cron. Sin body.`,
    tags: [TAGS.reminders],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    responses: {
      200: { description: "Resumen de la corrida (planificados + despachados).", schema: ok(ReminderDispatchSummarySchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "patch",
    path: "/api/shifts/reminders/{id}",
    summary: "Marcar un recordatorio como enviado / fallido, o reintentarlo",
    description: [
      `${receptionOnly} Acciones:`,
      "- `mark_sent` → SENT con `sentAt` = ahora y `manual: true` (recepción lo mandó por WhatsApp u otro medio). Si era WHATSAPP sin `deliveredTo`, guarda el teléfono del paciente. 409 si ya estaba SENT.",
      "- `mark_failed` → FAILED; `note` (≤ 200) queda como `errorMessage` (default: \"Marcado como no enviado por recepción\").",
      "- `retry` → solo desde FAILED y con el turno vigente (PENDING/CONFIRMED y futuro): vuelve a PENDING y, si su hora de envío ya pasó, se despacha en el momento (email real o `waLink`), ignorando `remindersEnabled`; si no, queda en cola. 409 si no aplica.",
      "Audit `UPDATE` sobre el turno con `{ reminderId, reminderAction }`. Devuelve el recordatorio actualizado.",
    ].join("\n"),
    tags: [TAGS.reminders],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    request: { params: IdParam, body: reminderActionSchema },
    responses: {
      200: { description: "Recordatorio actualizado.", schema: ok(ReminderItemSchema) },
      ...errors(
        400,
        401,
        403,
        404,
        { 409: "`mark_sent` sobre uno ya enviado; `retry` sobre uno que no está FAILED o cuyo turno ya no está vigente." },
      ),
    },
  },
  {
    method: "post",
    path: "/api/cron/reminders",
    summary: "Ciclo de recordatorios para el cron del servidor",
    description: [
      "Sin sesión: `Authorization: Bearer <CRON_SECRET>` (comparación en tiempo constante). Pensado para un cron externo cada 15-30 min; equivale a `pnpm reminders:run` y al botón de recepción.",
      cycleDescription,
      "Sin body.",
    ].join("\n\n"),
    tags: [TAGS.internal],
    auth: { kind: "secret", header: "Authorization" },
    responses: {
      200: { description: "Resumen de la corrida.", schema: ok(ReminderDispatchSummarySchema) },
      ...errors({ 401: "Header ausente o secreto incorrecto." }, 500, { 503: "`CRON_SECRET` no configurado en el servidor." }),
    },
  },
]);
