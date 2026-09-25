// Turnos: /api/shifts/**. `/api/patients/{id}/shifts` se documenta con los
// pacientes (DTO PatientShift) y `/api/shifts/reminders/**` con los recordatorios.
//
// Permisos: todas piden sesión. El listado y los reprogramados restringen al
// médico (rol "medic" en UserRole) a sus propios turnos; admin y secretaria ven
// todo. Alta, detalle, edición y borrado NO verifican que el turno sea del
// médico que llama. Llegada e inicio de consulta son de recepción
// (secretaria/admin).

import { z } from "zod";
import { createRecurringShiftsSchema, createShiftSchema, shiftsQuerySchema, updateShiftSchema } from "@/lib/validations";
import { defineRoutes, errors, IdParam, ok, TAGS } from "../registry";
import {
  RecurringShiftsCancelledSchema,
  RecurringShiftsResultSchema,
  ShiftArrivalClearedSchema,
  ShiftArrivalSchema,
  ShiftConflictErrorSchema,
  ShiftConsultationStartedSchema,
  ShiftContextSchema,
  ShiftDetailSchema,
  ShiftInsuranceWarningSchema,
  ShiftSchema,
} from "../schemas/shifts";

const GroupIdParam = z.object({ groupId: z.string().describe("`recurrenceGroupId` de la serie (UUID).") });

export const shiftsRoutes = defineRoutes([
  // ─── Colección ─────────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/shifts",
    summary: "Listar turnos (mes/año, profesional, estado, paciente)",
    description: [
      "Sin paginación: devuelve todos los que coinciden, ordenados por `start`. Filtrar por `month` + `year` (mes calendario) o solo `year`; sin ambos trae todo el histórico.",
      "El médico ve solo sus turnos (`userId` se ignora); secretaria y admin ven todos y pueden filtrar por `userId`.",
      "Incluye paciente (con teléfono y obra social), profesional y tipo de consulta.",
    ].join(" "),
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: { query: shiftsQuerySchema },
    responses: {
      200: { description: "Turnos ordenados por inicio.", schema: ok(z.array(ShiftSchema)) },
      ...errors(400, 401),
    },
  },
  {
    method: "post",
    path: "/api/shifts",
    summary: "Crear un turno",
    description: [
      "Cualquier rol; no verifica que `userId` sea el médico que llama. Rate limit 30 por minuto por usuario.",
      "Validaciones en orden: `end` > `start` (400); solapamiento con otro turno no cancelado del mismo profesional → 409 `SHIFT_CONFLICT` con `conflictDetails`, salvo `isOverbook: true`;",
      "día bloqueado del profesional → 409; fuera del horario de atención configurado para ese día de la semana → 409 (si el día no tiene franjas cargadas se permite);",
      "paciente inexistente o archivado → 404.",
      "Si el profesional tiene obras sociales aceptadas y el paciente no tiene ninguna de ellas, el turno se crea igual y la respuesta trae `warning` `INSURANCE_MISMATCH`.",
      "`status` default PENDING. No genera audit log.",
    ].join(" "),
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: {
      body: createShiftSchema,
      bodyDescription: "`start` y `end` en ISO 8601 (se parsean con `new Date`). `consultationTypeId` es informativo: la duración no se recalcula.",
    },
    responses: {
      201: {
        description: "Turno creado (con paciente, profesional y tipo de consulta). `warning` solo si hay desajuste de obra social.",
        schema: z.object({ success: z.literal(true), data: ShiftSchema, warning: ShiftInsuranceWarningSchema.optional() }),
      },
      ...errors({ 400: "Datos inválidos o `end` ≤ `start`." }, 401, { 404: "Paciente inexistente o archivado." }),
      409: {
        description: "Solapamiento (`code: SHIFT_CONFLICT`, con `conflictDetails`), día bloqueado o fuera del horario de atención.",
        schema: ShiftConflictErrorSchema,
      },
      ...errors({ 429: "Más de 30 altas por minuto para el usuario." }),
    },
  },

  // ─── Turno individual ──────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/shifts/{id}",
    summary: "Detalle de un turno",
    description: [
      "Cualquier rol, sin restricción por profesional (un médico puede ver turnos ajenos por id).",
      "Trae el paciente completo (datos personales, consentimiento, obra social), el tipo de consulta y el profesional con consultorio y especialidad.",
      "Con `withContext=true` agrega `meta` con la última visita finalizada y el próximo turno del paciente.",
    ].join(" "),
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: {
      params: IdParam,
      query: z.object({
        withContext: z.enum(["true"]).optional().describe("Agrega `meta` (última visita y próximo turno del paciente)."),
      }),
    },
    responses: {
      200: {
        description: "Turno con paciente completo. `meta` solo con `withContext=true`.",
        schema: z.object({ success: z.literal(true), data: ShiftDetailSchema, meta: ShiftContextSchema.optional() }),
      },
      ...errors(401, 404),
    },
  },
  {
    method: "put",
    path: "/api/shifts/{id}",
    summary: "Editar un turno (estado, horario, notas, paciente, profesional)",
    description: [
      "Cualquier rol, sin verificar autoría. Actualización parcial: solo se tocan los campos enviados.",
      "Cambiar `status` es la forma de confirmar, cancelar, marcar ausente o finalizar; no hay restricciones de transición.",
      "Si cambia `start` o `end`, valida `end` > `start` (400) y solapamiento con otros turnos no cancelados del profesional destino (409; no admite sobreturno). Si solo cambia `userId` no se revisa solapamiento.",
      "No permite cambiar `consultationTypeId` ni `isOverbook`. Audita `UPDATE` (con el nuevo `status` si cambió). La respuesta no incluye `consultationType`.",
    ].join(" "),
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: { params: IdParam, body: updateShiftSchema, bodyDescription: "`start` y `end` en ISO 8601." },
    responses: {
      200: { description: "Turno actualizado (paciente y profesional; sin `consultationType`).", schema: ok(ShiftSchema) },
      ...errors({ 400: "Datos inválidos o `end` ≤ `start`." }, 401, 404, { 409: "El profesional ya tiene un turno en ese horario." }),
    },
  },
  {
    method: "delete",
    path: "/api/shifts/{id}",
    summary: "Eliminar un turno (borrado físico)",
    description: [
      "Cualquier rol, sin verificar autoría ni estado. Borra el registro y, en cascada, sus recordatorios y la reserva online asociada; la evolución vinculada queda sin turno.",
      "Para cancelar conservando el historial usar `PUT` con `status: CANCELLED`. Audita `DELETE`.",
    ].join(" "),
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Turno eliminado.", schema: ok(z.object({ id: z.string() })) },
      ...errors(401, 404),
    },
  },

  // ─── Recepción: llegada y consulta ─────────────────────────────────────────
  {
    method: "post",
    path: "/api/shifts/{id}/arrival",
    summary: "Marcar la llegada del paciente (sala de espera)",
    description: "Recepción (secretaria o admin). Setea `arrivedAt` = ahora sin cambiar `status`. Repetirlo actualiza la hora. Sin body.",
    tags: [TAGS.shifts],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Llegada registrada.", schema: ok(ShiftArrivalSchema) },
      ...errors(401, 403, 404),
    },
  },
  {
    method: "delete",
    path: "/api/shifts/{id}/arrival",
    summary: "Deshacer la llegada",
    description:
      "Recepción (secretaria o admin). Vuelve `arrivedAt` a null; no toca `consultationStartedAt`. No verifica existencia: con un id inexistente responde 500, no 404.",
    tags: [TAGS.shifts],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Llegada deshecha.", schema: ok(ShiftArrivalClearedSchema) },
      ...errors(401, 403, { 500: "Turno inexistente (no hay chequeo previo) o error inesperado." }),
    },
  },
  {
    method: "post",
    path: "/api/shifts/{id}/start-consultation",
    summary: "Pasar el paciente a consulta",
    description:
      "Recepción (secretaria o admin; el médico no puede llamarla). Setea `consultationStartedAt` = ahora y, si no había llegada registrada, también `arrivedAt`. No cambia `status`. Sin body.",
    tags: [TAGS.shifts],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Consulta iniciada.", schema: ok(ShiftConsultationStartedSchema) },
      ...errors(401, 403, 404),
    },
  },

  // ─── Series recurrentes ────────────────────────────────────────────────────
  {
    method: "post",
    path: "/api/shifts/recurring",
    summary: "Crear una serie de turnos recurrentes",
    description: [
      "Cualquier rol. Genera `count` ocurrencias cada `frequencyWeeks` semanas desde `startDate`, todas PENDING y con el mismo `recurrenceGroupId`.",
      "Cada ocurrencia se omite (no falla) si el día está bloqueado, cae fuera del horario de atención de ese día o se solapa con otro turno no cancelado del profesional: aparece en `skipped` con el motivo.",
      "Responde 201 aunque no se haya creado ninguna (`recurrenceGroupId: null`). Sin chequeo de obra social, sin sobreturno, sin audit log.",
    ].join(" "),
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: {
      body: createRecurringShiftsSchema,
      bodyDescription: "`startDate` en `YYYY-MM-DD`; `startTime` y `endTime` en `HH:mm` (hora local del servidor). `count` 2 a 12, `frequencyWeeks` 1 a 4.",
    },
    responses: {
      201: { description: "Resultado de la serie: creados, omitidos y el id del grupo.", schema: ok(RecurringShiftsResultSchema) },
      ...errors({ 400: "Datos inválidos o `endTime` ≤ `startTime`." }, 401, { 404: "Paciente inexistente o archivado." }),
    },
  },
  {
    method: "get",
    path: "/api/shifts/recurring/{groupId}",
    summary: "Turnos de una serie recurrente",
    description:
      "Cualquier rol, sin restricción por profesional. Todos los turnos de la serie (incluidos cancelados), ordenados por `start`, con paciente (teléfono, obra social) y profesional; sin `consultationType`. 404 si la serie no tiene turnos.",
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: { params: GroupIdParam },
    responses: {
      200: { description: "Turnos de la serie.", schema: ok(z.array(ShiftSchema)) },
      ...errors(401, { 404: "No hay turnos con ese `recurrenceGroupId`." }),
    },
  },
  {
    method: "delete",
    path: "/api/shifts/recurring/{groupId}",
    summary: "Cancelar los turnos pendientes de una serie",
    description:
      "Cualquier rol. Pasa a CANCELLED los turnos PENDING y CONFIRMED de la serie; los FINISHED y ABSENT no se tocan y nada se borra. 404 si no había ninguno cancelable. Sin audit log.",
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: { params: GroupIdParam },
    responses: {
      200: { description: "Cantidad de turnos cancelados.", schema: ok(RecurringShiftsCancelledSchema) },
      ...errors(401, { 404: "La serie no existe o no tiene turnos PENDING/CONFIRMED." }),
    },
  },

  // ─── Reprogramados ─────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/shifts/rescheduled",
    summary: "Turnos reprogramados automáticamente en las últimas 48 h",
    description: [
      "Turnos con `rescheduledAt` en las últimas 48 h y no cancelados, más recientes primero. El médico ve solo los suyos; secretaria y admin todos.",
      "Paciente reducido (sin teléfono ni obra social), sin `consultationType`. Sirve para que recepción avise al paciente del cambio.",
    ].join(" "),
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Turnos reprogramados.", schema: ok(z.array(ShiftSchema)) },
      ...errors(401),
    },
  },
]);
