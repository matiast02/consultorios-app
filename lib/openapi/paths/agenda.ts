// Agenda: horarios de atención por día (/api/preferences), días bloqueados
// (/api/preferences/block-days, /api/block-days).
// Ninguna de estas rutas verifica rol ni que `userId` sea el propio: cualquier
// sesión lee y escribe la agenda de cualquier profesional (recepción la
// administra). DTO en ../schemas/agenda.ts.

import { z } from "zod";
import { addBlockDaysSchema, blockDaysQuerySchema, removeBlockDaySchema, upsertPreferencesSchema } from "@/lib/validations";
import { defineRoutes, errors, ok, TAGS } from "../registry";
import { BlockDaySchema, BlockDaysResultSchema, UserPreferenceSchema, UserPreferencesAndBlockDaysSchema } from "../schemas/agenda";

const anyUser = "Cualquier rol, sobre cualquier `userId` (no se verifica que sea el propio ni que sea médico).";

const upsertPreferences = {
  summary: "Guardar horarios de atención (upsert por día)",
  description: [
    "Upsert por (`userId`, `day`) en una transacción: solo toca los días enviados y no borra los que falten. Dentro de cada día, una franja omitida o en `null` queda en null (así se elimina una franja).",
    "Horas en `HH:mm`; `day` 0 = domingo … 6 = sábado. Devuelve los registros guardados en el orden enviado.",
    anyUser,
    "`POST` y `PUT` son equivalentes.",
  ].join(" "),
  tags: [TAGS.agenda] as [typeof TAGS.agenda],
  auth: { kind: "session" } as const,
  request: { body: upsertPreferencesSchema },
  responses: {
    200: { description: "Horarios guardados (uno por día enviado).", schema: ok(z.array(UserPreferenceSchema)) },
    ...errors(400, 401),
  },
};

const addBlockDays = {
  summary: "Bloquear días (reprograma los turnos afectados)",
  description: [
    "Crea un `BlockDay` por fecha (`YYYY-MM-DD`); las ya bloqueadas se ignoran (`created` cuenta solo las nuevas). Todas con la misma `category` (default `OTHER`) y `note`.",
    "Antes de crear, busca los turnos del profesional en esas fechas que no estén cancelados ni finalizados y los mueve automáticamente al siguiente día igual de la semana (hasta 8 semanas) que no esté bloqueado, tenga una franja configurada que contenga la hora y no tenga superposición; conserva hora y duración y guarda `rescheduledFrom`/`rescheduledAt`. Los que no encuentran lugar quedan en el día bloqueado y no aparecen en `rescheduledShifts`.",
    "No notifica al paciente ni al profesional.",
    anyUser,
    "`POST` y `PUT` son equivalentes.",
  ].join(" "),
  tags: [TAGS.agenda] as [typeof TAGS.agenda],
  auth: { kind: "session" } as const,
  request: { body: addBlockDaysSchema },
  responses: {
    200: { description: "Días bloqueados y turnos reprogramados.", schema: ok(BlockDaysResultSchema) },
    ...errors(400, 401),
  },
};

export const agendaRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/preferences",
    summary: "Horarios de atención y días bloqueados de un profesional",
    description: [
      "`userId` opcional (default: el usuario de la sesión); cualquier rol puede consultar los de cualquier profesional (recepción arma la agenda con esto).",
      "`preferences`: un registro por día configurado, franjas AM/PM en `HH:mm`. `blockDays`: todos los días bloqueados, sin filtro de fecha (para un rango usar `GET /api/block-days`).",
    ].join(" "),
    tags: [TAGS.agenda],
    auth: { kind: "session" },
    mobile: true,
    request: { query: z.object({ userId: z.string().optional().describe("Default: el usuario de la sesión.") }) },
    responses: {
      200: { description: "Horarios y días bloqueados.", schema: ok(UserPreferencesAndBlockDaysSchema) },
      ...errors({ 400: "Sin `userId` resoluble (no ocurre con sesión válida)." }, 401),
    },
  },
  { method: "post", path: "/api/preferences", ...upsertPreferences },
  { method: "put", path: "/api/preferences", ...upsertPreferences },
  { method: "post", path: "/api/preferences/block-days", ...addBlockDays },
  { method: "put", path: "/api/preferences/block-days", ...addBlockDays },
  {
    method: "delete",
    path: "/api/preferences/block-days",
    summary: "Desbloquear un día",
    description:
      "Borra el `BlockDay` cuyo `id` viene en el body. No verifica a qué profesional pertenece ni revierte turnos reprogramados por el bloqueo.",
    tags: [TAGS.agenda],
    auth: { kind: "session" },
    request: { body: removeBlockDaySchema },
    responses: {
      200: { description: "Día desbloqueado.", schema: ok(z.object({ id: z.string() })) },
      ...errors(400, 401, { 404: "No existe un día bloqueado con ese id." }),
    },
  },
  {
    method: "get",
    path: "/api/block-days",
    summary: "Días bloqueados de un profesional en un rango",
    description:
      "`from` y `to` obligatorios (cualquier string que acepte `Date`, típicamente `YYYY-MM-DD`; ambos inclusive porque los bloqueos se guardan a medianoche UTC). `userId` opcional (default: sesión). Ordenados por fecha. Cualquier rol.",
    tags: [TAGS.agenda],
    auth: { kind: "session" },
    mobile: true,
    request: { query: blockDaysQuerySchema },
    responses: {
      200: { description: "Días bloqueados en el rango.", schema: ok(z.array(BlockDaySchema)) },
      ...errors({ 400: "Faltan `from`/`to` o alguna fecha no se puede interpretar." }, 401),
    },
  },
]);
