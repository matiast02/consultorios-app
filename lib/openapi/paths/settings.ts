// Configuración del usuario logueado: /api/user/** (perfil, notificaciones,
// preferencias de agenda, exportación de datos) y las obras sociales que
// atiende un profesional (/api/users/{id}/insurances). Todas con sesión, sin
// distinción de rol: operan sobre el propio usuario, salvo las obras sociales,
// que reciben el id del profesional. DTO en ../schemas/users.ts.

import { z } from "zod";
import {
  updateNotificationsSchema,
  updatePreferencesConfigSchema,
  updateProfileSchema,
  updateUserInsurancesSchema,
} from "@/lib/validations";
import { defineRoutes, errors, ok, TAGS } from "../registry";
import {
  UserExportSchema,
  UserInsurancesResponseSchema,
  UserNotificationsSchema,
  UserPreferencesConfigSchema,
  UserProfileSchema,
  UserProfileUpdatedSchema,
} from "../schemas/users";

const UserIdParam = z.object({ id: z.string().describe("ID del usuario (profesional)") });

const sessionUserGone = { 404: "El usuario de la sesión ya no existe en la base." };

export const settingsRoutes = defineRoutes([
  // ─── Perfil ────────────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/user/profile",
    summary: "Perfil del usuario logueado",
    description:
      "Identidad, contacto y datos profesionales del usuario de la sesión, con la especialidad embebida. Sin rol ni contraseña (el rol viene en `GET /api/auth/get-session`).",
    tags: [TAGS.settings],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Perfil.", schema: ok(UserProfileSchema) },
      ...errors(401, sessionUserGone),
    },
  },
  {
    method: "patch",
    path: "/api/user/profile",
    summary: "Editar el perfil del usuario logueado",
    description: [
      "Actualización parcial (`null` limpia los anulables). Si no viene `name` pero sí `firstName` y/o `lastName`, `name` se recompone solo con los valores enviados (\"Nombre Apellido\").",
      "No cambia email, contraseña ni rol. `specializationId` no se valida contra el catálogo (un id inexistente rompe la FK → 500). Sin auditoría.",
    ].join(" "),
    tags: [TAGS.settings],
    auth: { kind: "session" },
    mobile: true,
    request: { body: updateProfileSchema },
    responses: {
      200: { description: "Perfil actualizado (subconjunto de campos).", schema: ok(UserProfileUpdatedSchema) },
      ...errors(400, 401),
    },
  },

  // ─── Notificaciones ────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/user/notifications",
    summary: "Preferencias de notificación del usuario logueado",
    description:
      "Seis toggles. Hoy solo `notifyNewShift` y `notifyCancellation` tienen efecto (notificaciones internas por reservas online del paciente); el resto se guarda para uso futuro.",
    tags: [TAGS.settings],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Toggles actuales.", schema: ok(UserNotificationsSchema) },
      ...errors(401, sessionUserGone),
    },
  },
  {
    method: "put",
    path: "/api/user/notifications",
    summary: "Actualizar las preferencias de notificación",
    description: "Actualización parcial a pesar del PUT: solo cambia los toggles enviados. Devuelve los seis. Sin auditoría.",
    tags: [TAGS.settings],
    auth: { kind: "session" },
    mobile: true,
    request: { body: updateNotificationsSchema },
    responses: {
      200: { description: "Toggles actualizados.", schema: ok(UserNotificationsSchema) },
      ...errors(400, 401),
    },
  },

  // ─── Preferencias de agenda y regionales ───────────────────────────────────
  {
    method: "get",
    path: "/api/user/preferences-config",
    summary: "Preferencias de agenda y regionales del usuario logueado",
    description:
      "Duración por defecto del turno, buffer y anticipación mínima (estas dos solo rigen la reserva online), si aparece en la reserva web, `agendaLocked` («Solo yo modifico mi agenda»: recepción no puede editar horarios ni días bloqueados; el admin sí), idioma, zona horaria y primer día de la semana. Los horarios de atención por día van por `/api/preferences`.",
    tags: [TAGS.settings],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Preferencias.", schema: ok(UserPreferencesConfigSchema) },
      ...errors(401, sessionUserGone),
    },
  },
  {
    method: "put",
    path: "/api/user/preferences-config",
    summary: "Actualizar las preferencias de agenda y regionales",
    description:
      "Actualización parcial a pesar del PUT: solo cambia lo enviado. `acceptsOnlineBooking: false` saca al profesional de la reserva web pública; `agendaLocked: true` impide que recepción edite la agenda del profesional. Sin auditoría.",
    tags: [TAGS.settings],
    auth: { kind: "session" },
    mobile: true,
    request: { body: updatePreferencesConfigSchema },
    responses: {
      200: { description: "Preferencias actualizadas.", schema: ok(UserPreferencesConfigSchema) },
      ...errors({ 400: "Fuera de rango (`slotDurationMinutes` 5-240, `bufferMinutes` 0-60, `minAdvanceMinutes` 0-43200, `weekStart` 0-6)." }, 401),
    },
  },

  // ─── Exportación (portabilidad) ────────────────────────────────────────────
  {
    method: "get",
    path: "/api/user/export",
    summary: "Exportar todos los datos del profesional (JSON descargable)",
    description: [
      "Portabilidad de los datos del usuario logueado: perfil, horarios, días bloqueados, obras sociales aceptadas, todos sus turnos (con paciente, evolución, recetas y órdenes) y los pacientes que atendió (con obra social principal, adicionales y ficha clínica), archivados incluidos.",
      "Datos clínicos con la misma política que la HC: secretaría exporta sin nada clínico; el médico solo sus propios asientos y la ficha de los pacientes de los que es tratante; el admin todo. Audita `VIEW_SENSITIVE` (recurso `export`) con conteos, sin contenido.",
      "Responde el JSON **sin envoltorio `success`** y con `Content-Disposition: attachment; filename=\"consultorio-export-YYYY-MM-DD.json\"`. Puede ser muy pesado (recorre paciente por paciente): pensado para la web, no para la app.",
    ].join("\n\n"),
    tags: [TAGS.settings],
    auth: { kind: "session" },
    responses: {
      200: { description: "Volcado JSON (descarga).", schema: UserExportSchema },
      ...errors(401, sessionUserGone),
    },
  },

  // ─── Obras sociales que atiende el profesional ─────────────────────────────
  {
    method: "get",
    path: "/api/users/{id}/insurances",
    summary: "Obras sociales que atiende un profesional",
    description: [
      "Lista con copago, por nombre. Cualquier rol y cualquier `id`: recepción la consulta al dar un turno para avisar si el profesional no atiende la obra social del paciente.",
      "No verifica que el usuario exista (id desconocido → listas vacías). `data` y `accepted` traen las mismas obras sociales; `accepted` agrega el copago.",
    ].join(" "),
    tags: [TAGS.settings],
    auth: { kind: "session" },
    request: { params: UserIdParam },
    responses: {
      200: { description: "Obras sociales aceptadas.", schema: UserInsurancesResponseSchema },
      ...errors(401),
    },
  },
  {
    method: "put",
    path: "/api/users/{id}/insurances",
    summary: "Reemplazar las obras sociales que atiende un profesional",
    description: [
      "Reemplazo completo en una transacción (borra todas y crea las enviadas). Acepta `insurances: [{ insuranceId, copago }]` (forma actual) o `insuranceIds: string[]` (histórica, copago 0); si vienen ambas gana `insurances`; sin ninguna, deja al profesional sin obras sociales.",
      "**No restringe por rol ni por identidad:** cualquier sesión puede editar las de cualquier usuario. Un `insuranceId` inexistente o repetido hace fallar la transacción (500). Sin auditoría.",
    ].join(" "),
    tags: [TAGS.settings],
    auth: { kind: "session" },
    request: { params: UserIdParam, body: updateUserInsurancesSchema },
    responses: {
      200: { description: "Lista resultante (misma forma que el GET).", schema: UserInsurancesResponseSchema },
      ...errors({ 400: "`insurances`/`insuranceIds` mal formados o `copago` fuera de 0-10.000.000." }, 401),
    },
  },
]);
