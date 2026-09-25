// Administración: /api/admin/**, /api/register, /api/modules/**.
// Ninguna de estas rutas la usa la app móvil.

import { z } from "zod";
import { clinicHoursWeekSchema, clinicSettingsSchema } from "@/lib/validations";
import { defineRoutes, errors, IdParam, ok, okEmpty, TAGS } from "../registry";
import {
  ClinicHoursDaySchema,
  ClinicSettingsSchema,
  ContactRequestSchema,
  ContactRequestStatusSchema,
  ModuleConfigSchema,
  RegisterErrorSchema,
  RegisterResponseSchema,
  UserModuleAccessSchema,
} from "../schemas/admin";
import { WaitingRoomDisplayKeyCreatedSchema, WaitingRoomDisplayKeyStatusSchema } from "../schemas/waiting-room";
import { passwordSchema } from "@/lib/validations";
import { PASSWORD_POLICY_DESCRIPTION } from "@/lib/password-policy";

const ModuleParam = z.object({ module: z.string().describe('Clave del módulo (p. ej. "prescriptions").') });

/** Errores de POST /api/register que salen SIN envoltorio `success` (formato legado `{ error }`). */
const registerErrors = (codes: Record<number, string>) =>
  Object.fromEntries(Object.entries(codes).map(([s, d]) => [s, { description: d, schema: RegisterErrorSchema }]));

export const adminRoutes = defineRoutes([
  // ─── Horarios del consultorio ─────────────────────────────────────────────
  {
    method: "get",
    path: "/api/admin/clinic-hours",
    summary: "Horarios de atención del consultorio (7 días)",
    description:
      "Devuelve siempre los 7 días ordenados por `dayOfWeek` (0 = lunes). Si faltan filas (seed no aplicado) las crea como cerradas antes de responder. Son los horarios generales de la landing, no los de cada profesional.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: { description: "Los 7 días.", schema: ok(z.array(ClinicHoursDaySchema)) },
      ...errors(401, 403),
    },
  },
  {
    method: "put",
    path: "/api/admin/clinic-hours",
    summary: "Reemplazar los horarios de la semana",
    description:
      "Body: array de exactamente 7 días. Por cada día se hace upsert por `dayOfWeek`; con `closed: true` los cuatro horarios quedan en null; un horario vacío también se guarda como null. Audita `UPDATE` sobre `clinic_hours`.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    request: { body: clinicHoursWeekSchema },
    responses: {
      200: { description: "Los 7 días ya guardados.", schema: ok(z.array(ClinicHoursDaySchema)) },
      ...errors({ 400: "Datos inválidos (ver `details`) o `dayOfWeek` repetido." }, 401, 403),
    },
  },

  // ─── Datos del consultorio ────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/admin/clinic-settings",
    summary: "Configuración del consultorio",
    description:
      "Singleton `id: \"default\"`; si no existe se crea con los valores por defecto. Incluye datos del sitio público, recordatorios y reservas online, más `emailConfigured` (derivado del entorno).",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: { description: "Configuración completa.", schema: ok(ClinicSettingsSchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "put",
    path: "/api/admin/clinic-settings",
    summary: "Guardar la configuración del consultorio",
    description: [
      "Todos los campos son opcionales y se guardan por grupos, para que cada formulario pueda grabar sin pisar a los otros:",
      "los campos del **sitio público** (nombre, contacto, dirección, mapa, flags `show*`, cifras) se reemplazan **todos juntos** si viene al menos uno (los ausentes quedan en null / default `true`);",
      "los de **recordatorios** y **reservas online** se actualizan solo si están presentes en el body.",
      "Strings vacíos se guardan como null; los WhatsApp se normalizan a solo dígitos. 400 si `reminderSecondHoursBefore` no es menor que `reminderHoursBefore` (efectivo). Audita `UPDATE` sobre `clinic_settings` con los campos tocados.",
    ].join(" "),
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    request: { body: clinicSettingsSchema },
    responses: {
      200: { description: "Configuración resultante.", schema: ok(ClinicSettingsSchema) },
      ...errors(
        { 400: "Datos inválidos (ver `details`), incluido segundo recordatorio no anterior al primero." },
        401,
        403,
      ),
    },
  },

  // ─── Solicitudes de contacto (landing) ────────────────────────────────────
  {
    method: "get",
    path: "/api/admin/contact-requests",
    summary: "Bandeja de solicitudes de contacto",
    description:
      "Solicitudes enviadas desde el formulario público de la landing, más nuevas primero, máximo 200 (sin paginación). Filtro por `status`; `all` (default) trae todas. La ven admin y secretaría.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin", "secretary"] },
    request: {
      query: z.object({
        status: z
          .enum(["new", "read", "archived", "all"])
          .optional()
          .describe("Estado a filtrar; default `all`."),
      }),
    },
    responses: {
      200: { description: "Solicitudes (hasta 200).", schema: ok(z.array(ContactRequestSchema)) },
      ...errors({ 400: "`status` inválido." }, 401, 403),
    },
  },
  {
    method: "patch",
    path: "/api/admin/contact-requests/{id}",
    summary: "Cambiar estado o marcar WhatsApp abierto",
    description:
      "Actualiza `status` y/o `whatsappOpened` (al menos uno). Al pasar a `read` se setea `readAt`. Audita `UPDATE` sobre `contact_request`.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin", "secretary"] },
    request: {
      params: IdParam,
      body: z.object({
        status: ContactRequestStatusSchema.optional(),
        whatsappOpened: z.boolean().optional(),
      }),
    },
    responses: {
      200: { description: "Solicitud actualizada.", schema: ok(ContactRequestSchema) },
      ...errors(400, 401, 403, 404),
    },
  },
  {
    method: "delete",
    path: "/api/admin/contact-requests/{id}",
    summary: "Eliminar una solicitud de contacto",
    description: "Borrado físico (no son datos clínicos ni de pacientes registrados). Audita `DELETE` sobre `contact_request`.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin", "secretary"] },
    request: { params: IdParam },
    responses: {
      200: { description: "Eliminada.", schema: ok(z.object({ id: z.string() })) },
      ...errors(401, 403, 404),
    },
  },

  // ─── Alta de usuarios ─────────────────────────────────────────────────────
  {
    method: "post",
    path: "/api/register",
    operationId: "registerUser",
    summary: "Crear un usuario (médico, secretaría o admin)",
    description: [
      "Solo el admin. Crea `User` + credencial (hash bcrypt en `Account`, providerId `credential`) + rol en una transacción; si `role` no viene, el usuario queda sin rol.",
      "Rate limit 5 por minuto por IP (429). Audita `CREATE user` con nombre, email y rol. Con `sendInvite` envía la invitación por email; si el envío falla el usuario igual queda creado e `invite.sent` es false.",
      "**Formato propio:** el 201 no lleva `success`, y 400/409/500 responden `{ error }` sin `success: false` (401/403/429 sí usan el error estándar).",
    ].join(" "),
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    request: {
      body: z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: passwordSchema.describe(PASSWORD_POLICY_DESCRIPTION),
        role: z.enum(["medic", "secretary", "admin"]).optional().describe("Si viene, el usuario se crea ya con su rol."),
        sendInvite: z
          .boolean()
          .optional()
          .describe("Manda al email un link de un solo uso para definir la contraseña (vence en 72 h) con el proveedor de email configurado. La respuesta informa en `invite` si salió."),
      }),
    },
    responses: {
      201: { description: "Usuario creado.", schema: RegisterResponseSchema },
      ...registerErrors({
        400: "Body inválido (primer mensaje de Zod, en inglés) o el rol indicado no existe en la tabla `Role`.",
        409: "Ya existe una cuenta con ese email.",
        500: "Error inesperado.",
      }),
      ...errors(401, { 403: "La sesión no es admin." }, { 429: "Más de 5 altas por minuto desde la misma IP." }),
    },
  },

  // ─── Módulos ──────────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/modules",
    summary: "Listar la configuración de módulos",
    description: "Habilitación global de cada módulo, ordenada por clave. Cualquier usuario con sesión (la UI decide qué mostrar).",
    tags: [TAGS.admin],
    auth: { kind: "session" },
    responses: {
      200: { description: "Módulos.", schema: ok(z.array(ModuleConfigSchema)) },
      ...errors(401),
    },
  },
  {
    method: "put",
    path: "/api/modules",
    summary: "Habilitar o deshabilitar un módulo",
    description:
      "Solo módulos existentes (los crea el seed): clave desconocida → 404, ya no se crean filas nuevas. Validación manual (sin Zod): 400 si faltan `module` (string) o `enabled` (boolean). Audita `UPDATE` sobre `module`.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    request: {
      body: z.object({
        module: z.string().min(1).describe("Clave del módulo."),
        enabled: z.boolean(),
      }),
    },
    responses: {
      200: { description: "Módulo resultante.", schema: ok(ModuleConfigSchema) },
      ...errors({ 400: "Faltan `module` (string) o `enabled` (boolean)." }, 401, 403, { 404: "Módulo desconocido." }),
    },
  },
  {
    method: "get",
    path: "/api/modules/{module}/users",
    summary: "Accesos de usuarios a un módulo",
    description: "Filas de `UserModuleAccess` del módulo con el usuario, ordenadas por `userId`. Un módulo inexistente devuelve lista vacía.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    request: { params: ModuleParam },
    responses: {
      200: { description: "Accesos.", schema: ok(z.array(UserModuleAccessSchema)) },
      ...errors(401, 403),
    },
  },
  {
    method: "put",
    path: "/api/modules/{module}/users",
    summary: "Dar o quitar acceso de un usuario a un módulo",
    description:
      "Upsert por (`userId`, `module`). Validación manual: 400 si faltan `userId` (string) o `enabled` (boolean). `userId` inexistente o dado de baja → 404. Audita `UPDATE` sobre `module_access`.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    request: {
      params: ModuleParam,
      body: z.object({
        userId: z.string().min(1),
        enabled: z.boolean(),
      }),
    },
    responses: {
      200: { description: "Acceso resultante.", schema: ok(UserModuleAccessSchema) },
      ...errors({ 400: "Faltan `userId` (string) o `enabled` (boolean)." }, 401, 403, { 404: "`userId` inexistente o dado de baja." }),
    },
  },

  // ─── Pantalla de la sala de espera: clave de dispositivo ──────────────────
  {
    method: "get",
    path: "/api/admin/waiting-room-display-key",
    summary: "Estado de la clave de la pantalla de la sala",
    description: "Solo admin. Dice si hay clave configurada y desde cuándo; nunca devuelve la clave.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: { description: "Estado.", schema: ok(WaitingRoomDisplayKeyStatusSchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "post",
    path: "/api/admin/waiting-room-display-key",
    summary: "Generar o rotar la clave de la pantalla",
    description:
      "Solo admin. Genera una clave nueva (la anterior deja de valer) y la devuelve UNA sola vez junto con el link `/sala?k=…`; en la base queda el hash. Audita `UPDATE` sobre `clinic_settings` (`created` / `rotated`). Sin body.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: { description: "Clave nueva.", schema: ok(WaitingRoomDisplayKeyCreatedSchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "delete",
    path: "/api/admin/waiting-room-display-key",
    summary: "Revocar la clave de la pantalla",
    description: "Solo admin. Borra el hash: la pantalla recibe 404 hasta que se genere otra. Audita `UPDATE` (`revoked`).",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: { description: "Revocada.", schema: okEmpty },
      ...errors(401, 403),
    },
  },
]);
