// Público (sin sesión): /api/public/**.
// Landing, reserva online y links por token. Todas con rate limit por IP
// (429 con `Retry-After`) y `Cache-Control: no-store` salvo las dos de la
// landing, que se cachean 60 s. Ninguna la usa la app móvil.

import { z } from "zod";
import {
  contactRequestSchema,
  publicBookingActionSchema,
  publicBookingAvailabilityQuerySchema,
  publicBookingCreateSchema,
  publicShiftActionSchema,
} from "@/lib/validations";
import { defineRoutes, errors, ok, TAGS } from "../registry";
import {
  ClinicInfoSchema,
  ClinicScheduleMedicSchema,
  ContactRequestCreatedSchema,
  PublicAvailabilitySchema,
  PublicBookingConfigSchema,
  PublicBookingConflictSchema,
  PublicBookingCreatedSchema,
  PublicBookingViewSchema,
  PublicShiftConfirmationSchema,
  PublicShiftConflictSchema,
} from "../schemas/public";

const TokenParam = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).describe("Token del link (base64url). Solo su hash vive en la base."),
});

/** Campos anti-bot que las rutas leen ANTES de validar el body (no forman parte del schema Zod). */
const antiBotFields = {
  _hp: z.string().optional().describe("Honeypot: campo oculto que un humano nunca completa. Si viene con texto, se descarta el envío."),
  _elapsedMs: z.number().optional().describe("Milisegundos desde que se abrió el formulario. Si es demasiado bajo, se descarta el envío."),
};

const rateLimit = (n: number, window: string) => `Rate limit ${n} por ${window} por IP (429 con \`Retry-After\`).`;

export const publicRoutes = defineRoutes([
  // ─── Landing ──────────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/public/clinic-info",
    summary: "Información del consultorio para la landing",
    description:
      "Configuración pública, horarios generales, profesionales activos, especialidades con profesionales y obras sociales, en una sola llamada. Se cachea 60 s (`revalidate`). No expone la configuración de recordatorios ni la ventana de reservas online: de eso solo sale `onlineBookingEnabled`.",
    tags: [TAGS.public],
    auth: { kind: "public" },
    responses: {
      200: { description: "Datos de la landing.", schema: ok(ClinicInfoSchema) },
      ...errors(500),
    },
  },
  {
    method: "get",
    path: "/api/public/clinic-schedule",
    summary: "Horarios semanales por profesional",
    description:
      "Para cada profesional activo, los 7 días con rango AM y PM (o null) a partir de sus preferencias de atención. Los días se devuelven con lunes = 0 (las preferencias se guardan con domingo = 0). Se cachea 60 s.",
    tags: [TAGS.public],
    auth: { kind: "public" },
    responses: {
      200: { description: "Profesionales con su semana.", schema: ok(z.array(ClinicScheduleMedicSchema)) },
      ...errors(500),
    },
  },
  {
    method: "post",
    path: "/api/public/contact-requests",
    summary: "Enviar una solicitud de contacto",
    description: [
      "Formulario de la landing. Exige `privacyAccepted: true` (Ley 25.326 art. 5-6, texto de la Disp. DNPDP 10/2008); se guardan IP y user agent.",
      rateLimit(5, "10 minutos"),
      "Anti-bot sin servicio externo: honeypot `_hp` y tiempo mínimo `_elapsedMs` < 1500 ms → responde **201 con forma de éxito** (`id: null`) sin guardar nada, para no delatar la trampa.",
      "Si el consultorio tiene WhatsApp configurado, devuelve el link click-to-chat con el mensaje prellenado.",
    ].join(" "),
    tags: [TAGS.public],
    auth: { kind: "public" },
    request: { body: contactRequestSchema.extend(antiBotFields) },
    responses: {
      201: { description: "Solicitud registrada (o señuelo anti-bot con `id: null`).", schema: ok(ContactRequestCreatedSchema) },
      ...errors({ 400: "Datos inválidos (ver `details`), incluida la falta de `privacyAccepted`." }, 429, 500),
    },
  },

  // ─── Reserva online ───────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/public/booking/config",
    summary: "Configuración pública de la reserva online",
    description: [
      "Lo que necesita /reservar: si el módulo está habilitado, aviso del consultorio, ventana de reserva, tipos de consulta y profesionales agrupados por especialidad.",
      "Con el módulo deshabilitado responde **200 con `enabled: false`** y listas vacías (no se expone la lista de profesionales).",
      rateLimit(60, "10 minutos"),
    ].join(" "),
    tags: [TAGS.public],
    auth: { kind: "public" },
    responses: {
      200: { description: "Configuración.", schema: ok(PublicBookingConfigSchema) },
      ...errors(429, 500),
    },
  },
  {
    method: "get",
    path: "/api/public/booking/availability",
    summary: "Huecos libres de un profesional",
    description: [
      "Días desde `from` (default hoy, hora de Argentina) por `days` (1 a 14, default 7) con los horarios libres para reservar online. Solo huecos libres: nunca datos de otros turnos.",
      "Aplica la anticipación mínima mayor entre la del consultorio y la del profesional; los días fuera de la ventana `[hoy, hoy + maxDaysAhead]` vienen como `closed`.",
      "La duración sale del `consultationTypeId` o, si no viene, de la del profesional.",
      rateLimit(120, "10 minutos"),
    ].join(" "),
    tags: [TAGS.public],
    auth: { kind: "public" },
    request: { query: publicBookingAvailabilityQuerySchema },
    responses: {
      200: { description: "Disponibilidad por día.", schema: ok(PublicAvailabilitySchema) },
      ...errors(
        { 400: "Parámetros inválidos (ver `details`), fecha inválida o tipo de consulta inexistente (code `INVALID_INPUT`)." },
        { 404: "El profesional no existe, está inactivo o no toma reservas online (code `NOT_FOUND`)." },
        429,
        { 503: "Reservas online deshabilitadas (code `DISABLED`)." },
      ),
    },
  },
  {
    method: "post",
    path: "/api/public/booking",
    summary: "Pedir un turno online (sin cuenta)",
    description: [
      "Crea un turno `PENDING` con `source: ONLINE` que recepción debe confirmar, más una `OnlineBookingRequest` con lo cargado. Exige `privacyAccepted: true`. Sin texto libre de motivo (nada clínico).",
      "Si el DNI ya existe, el turno se vincula al paciente existente **sin revelar ni modificar sus datos** (recepción ve `patientDataMismatch`); si no, alta mínima del paciente. Si el DNI es de un paciente archivado, la ficha nueva se crea sin DNI.",
      "Concurrencia: transacción con bloqueo por profesional y re-chequeo del hueco → el segundo en llegar recibe 409 `SLOT_TAKEN`. Máximo 3 reservas pendientes a futuro por DNI (409 `TOO_MANY_PENDING`).",
      `${rateLimit(10, "hora")} Anti-bot: honeypot \`_hp\` o \`_elapsedMs\` < 3000 ms → **201 señuelo** con forma de éxito y link inválido, sin guardar nada.`,
      "Efectos: notificación interna a recepción (y al profesional si lo pidió), email al paciente con el link de gestión si cargó email y hay proveedor configurado, audit `CREATE shift` (y `patient` si se creó) con `userId: null` y sin datos personales. La respuesta solo repite lo que cargó el solicitante; el token de gestión no se vuelve a mostrar.",
    ].join("\n\n"),
    tags: [TAGS.public],
    auth: { kind: "public" },
    request: { body: publicBookingCreateSchema.extend(antiBotFields) },
    responses: {
      201: { description: "Reserva registrada, pendiente de confirmación (o señuelo anti-bot).", schema: ok(PublicBookingCreatedSchema) },
      ...errors(
        { 400: "Body no es un objeto, datos inválidos (ver `details`) o tipo de consulta inexistente (code `INVALID_INPUT`)." },
        { 409: "Horario recién ocupado (code `SLOT_TAKEN`) o demasiadas reservas pendientes con ese DNI (code `TOO_MANY_PENDING`)." },
        {
          422: "El profesional no toma reservas online (`MEDIC_UNAVAILABLE`), horario fuera de la ventana habilitada (`OUT_OF_WINDOW`) o no coincide con la grilla del profesional (`NOT_A_SLOT`).",
        },
        429,
        { 503: "Reservas online deshabilitadas (code `DISABLED`)." },
        500,
      ),
    },
  },
  {
    method: "get",
    path: "/api/public/booking/{token}",
    summary: "Ver una reserva online por su link de gestión",
    description: [
      "Página /reserva/<token>. Solo datos que cargó el solicitante (primer nombre), fecha, profesional, tipo de consulta y el estado efectivo; nunca datos del paciente registrado ni nada clínico.",
      "Token inválido, vencido (el turno ya empezó) o de un paciente archivado → mismo 404 genérico. Sigue funcionando aunque se deshabilite el módulo.",
      rateLimit(30, "10 minutos (compartido con el POST)"),
    ].join(" "),
    tags: [TAGS.public],
    auth: { kind: "public" },
    request: { params: TokenParam },
    responses: {
      200: { description: "Vista de la reserva.", schema: ok(PublicBookingViewSchema) },
      ...errors({ 404: "El link no es válido o ya venció." }, 429, 500),
    },
  },
  {
    method: "post",
    path: "/api/public/booking/{token}",
    summary: "Cancelar la reserva desde el link de gestión",
    description: [
      "Única acción: `cancel`. Cancela el turno (condicional: solo si sigue PENDING/CONFIRMED y a futuro) y la request (`cancelledBy: PATIENT`), descarta los recordatorios pendientes, notifica a recepción (y al profesional si lo pidió) y audita `UPDATE shift` con `userId: null`.",
      "Si la reserva ya no admite cancelación (cancelada, vencida, finalizada o cambió mientras se procesaba) responde 409 `INVALID_STATE` con la vista actual en `data`.",
      rateLimit(30, "10 minutos (compartido con el GET)"),
    ].join(" "),
    tags: [TAGS.public],
    auth: { kind: "public" },
    request: { params: TokenParam, body: publicBookingActionSchema },
    responses: {
      200: { description: "Reserva cancelada (`status: CANCELLED`, `canCancel: false`).", schema: ok(PublicBookingViewSchema) },
      ...errors({ 400: "Acción inválida (solo `cancel`)." }, { 404: "El link no es válido o ya venció (code `NOT_FOUND`)." }),
      409: {
        description: "La reserva ya no se puede cancelar desde el link (code `INVALID_STATE`); `data` trae la vista actual.",
        schema: PublicBookingConflictSchema,
      },
      ...errors(429, 500),
    },
  },

  // ─── Link de confirmación de turno (recordatorios) ────────────────────────
  {
    method: "get",
    path: "/api/public/turno/{token}",
    summary: "Ver el turno desde el link del recordatorio",
    description: [
      "Página /turno/<token>. El token es de un solo recordatorio, vence con el turno y solo permite confirmar / cancelar ese turno u optar por no recibir más recordatorios.",
      "Datos mínimos: primer nombre, fecha, profesional, dirección y estado. NUNCA observaciones, tipo de consulta ni nada clínico.",
      "Token inválido, vencido, de un turno inexistente o de un paciente archivado → mismo 404. Respuestas con `Cache-Control: no-store` y `X-Robots-Tag: noindex`.",
      rateLimit(20, "10 minutos (compartido con el POST)"),
    ].join(" "),
    tags: [TAGS.public],
    auth: { kind: "public" },
    request: { params: TokenParam },
    responses: {
      200: { description: "Vista mínima del turno.", schema: ok(PublicShiftConfirmationSchema) },
      ...errors({ 404: "El link no es válido o ya venció." }, 429, 500),
    },
  },
  {
    method: "post",
    path: "/api/public/turno/{token}",
    summary: "Confirmar, cancelar u optar por no recibir recordatorios",
    description: [
      "`confirm`: el turno pasa a CONFIRMED (`confirmedVia: PATIENT_LINK`). `cancel`: pasa a CANCELLED, se descartan los recordatorios pendientes y se notifica al profesional (sin datos clínicos). Ambas son condicionales: si recepción lo canceló o finalizó entre medio, 409.",
      "`opt_out` (oposición, Ley 25.326 art. 27): marca `reminderOptOut` en el paciente y descarta todos sus recordatorios pendientes; vale aunque el turno ya no admita cambios.",
      "La respuesta queda registrada en el recordatorio (`response`, `respondedAt`) y se audita `UPDATE shift` con `userId: null` y la acción.",
      rateLimit(20, "10 minutos (compartido con el GET)"),
    ].join(" "),
    tags: [TAGS.public],
    auth: { kind: "public" },
    request: { params: TokenParam, body: publicShiftActionSchema },
    responses: {
      200: { description: "Vista actualizada del turno.", schema: ok(PublicShiftConfirmationSchema) },
      ...errors({ 400: "Acción inválida (`confirm`, `cancel` u `opt_out`)." }, { 404: "El link no es válido o ya venció." }),
      409: {
        description: "El turno ya no admite cambios (cancelado, finalizado, ausente o ya empezó); `data` trae la vista actual. Sin `code`.",
        schema: PublicShiftConflictSchema,
      },
      ...errors(429, 500),
    },
  },
]);
