// Usuarios: administración (/api/users, /api/users/{id}, reset de contraseña,
// configuración de profesión), profesionales para formularios
// (/api/users/medics) y disponibilidad para dar turnos (availability,
// available-slots, has-schedule). DTO en ../schemas/users.ts.
//
// Ojo: varias lecturas (`GET /api/users`, `GET /api/users/{id}`,
// profession-config, disponibilidad) solo exigen sesión, sin rol; se documenta
// el comportamiento real (ver ROADMAP B13).

import { z } from "zod";
import { availabilityQuerySchema, updateUserSchema } from "@/lib/validations";
import { defineRoutes, errors, IsoDate, ok, okEmpty, TAGS } from "../registry";
import { ProfessionConfigSchema } from "../schemas/catalogs";
import {
  AvailableSlotsSchema,
  MedicRefSchema,
  UserAvailabilitySchema,
  UserHasScheduleSchema,
  UserSchema,
} from "../schemas/users";

const UserIdParam = z.object({ id: z.string().describe("ID del usuario") });

/** Mismo criterio que la ruta (schema inline en app/api/users/[id]/reset-password). */
const adminResetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
});

export const usersRoutes = defineRoutes([
  // ─── Administración ────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/users",
    summary: "Listar usuarios (profesionales, secretarias, admins)",
    description:
      "Usuarios no borrados, más nuevos primero, con roles aplanados. `search` busca en nombre, apellido y email; `role` filtra por rol. Solo exige sesión (cualquier rol).",
    tags: [TAGS.admin],
    auth: { kind: "session" },
    request: {
      query: z.object({
        search: z.string().optional().describe("Texto a buscar en name, firstName, lastName o email."),
        role: z.enum(["medic", "secretary", "admin"]).optional(),
      }),
    },
    responses: {
      200: { description: "Usuarios.", schema: ok(z.array(UserSchema)) },
      ...errors(401),
    },
  },
  {
    method: "get",
    path: "/api/users/{id}",
    summary: "Detalle de un usuario",
    description: "Incluye matrícula, especialidad y roles. Solo exige sesión.",
    tags: [TAGS.admin],
    auth: { kind: "session" },
    request: { params: UserIdParam },
    responses: {
      200: { description: "Usuario.", schema: ok(UserSchema) },
      ...errors(401, 404),
    },
  },
  {
    method: "put",
    path: "/api/users/{id}",
    summary: "Editar un usuario (datos, rol, habilitación)",
    description: [
      "Admin: todo. Secretaria: solo usuarios con rol `medic`, y sin cambiar `role` ni `isActive` (403).",
      "`isActive: false` revoca todas las sesiones del usuario. Cambiar `role` reemplaza el rol actual.",
      "Audita `UPDATE` sobre `user`.",
    ].join(" "),
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { params: UserIdParam, body: updateUserSchema },
    responses: {
      200: { description: "Usuario actualizado.", schema: ok(UserSchema) },
      ...errors(400, 401, { 403: "Secretaria editando a no-médico, o cambiando rol / habilitación." }, 404),
    },
  },
  {
    method: "delete",
    path: "/api/users/{id}",
    summary: "Dar de baja un usuario (baja lógica)",
    description:
      "Marca `deletedAt` y revoca todas sus sesiones. Nunca se borra un admin (403); la secretaria solo puede dar de baja médicos; nadie puede darse de baja a sí mismo (409). Audita `DELETE`.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { params: UserIdParam },
    responses: {
      200: { description: "Usuario dado de baja.", schema: ok(z.object({ id: z.string() })) },
      ...errors(401, { 403: "Sin rol suficiente, objetivo admin, o secretaria sobre no-médico." }, 404, { 409: "Intento de darse de baja a sí mismo." }),
    },
  },
  {
    method: "post",
    path: "/api/users/{id}/reset-password",
    summary: "Restablecer la contraseña de un usuario (admin)",
    description:
      "Guarda el hash nuevo y revoca **todas** las sesiones del usuario afectado. Audita `UPDATE` sobre `user`. Mínimo 8 caracteres, una mayúscula y un número.",
    tags: [TAGS.admin],
    auth: { kind: "session", roles: ["admin"] },
    request: { params: UserIdParam, body: adminResetPasswordSchema },
    responses: {
      200: { description: "Contraseña restablecida.", schema: okEmpty },
      ...errors(400, 401, 403, 404),
    },
  },
  {
    method: "get",
    path: "/api/users/{id}/profession-config",
    summary: "Configuración de profesión del usuario (etiquetas y módulos)",
    description:
      "La configuración asociada a la especialidad del usuario (\"Dr/a.\", \"Receta\", \"Historia Clínica\", módulos habilitados). `data: null` si el usuario no tiene especialidad o esta no tiene configuración. Solo exige sesión; también resuelve usuarios dados de baja.",
    tags: [TAGS.admin],
    auth: { kind: "session" },
    mobile: true,
    request: { params: UserIdParam },
    responses: {
      200: { description: "Configuración o null.", schema: ok(ProfessionConfigSchema.nullable()) },
      ...errors(401, 404),
    },
  },

  // ─── Profesionales para formularios ────────────────────────────────────────
  {
    method: "get",
    path: "/api/users/medics",
    summary: "Listar profesionales (rol medic)",
    description:
      "Usuarios no borrados con rol `medic`, por apellido, con especialidad y profesión. Para selectores de turnos y reservas. Incluye deshabilitados (`isActive` no viene: filtrar con `GET /api/users` si hace falta).",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Profesionales.", schema: ok(z.array(MedicRefSchema)) },
      ...errors(401),
    },
  },

  // ─── Disponibilidad ────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/users/{id}/availability",
    summary: "Horarios de atención y días bloqueados de un profesional en un mes",
    description:
      "`preferences` son los horarios semanales (no dependen del mes); `blockDays` solo los del mes pedido. El rango del mes se arma en hora local del servidor.",
    tags: [TAGS.agenda],
    auth: { kind: "session" },
    mobile: true,
    request: { params: UserIdParam, query: availabilityQuerySchema },
    responses: {
      200: { description: "Disponibilidad del mes.", schema: ok(UserAvailabilitySchema) },
      ...errors({ 400: "`month` (1-12) y `year` son obligatorios." }, 401),
    },
  },
  {
    method: "get",
    path: "/api/users/{id}/available-slots",
    summary: "Grilla de horarios de un día (libres y ocupados)",
    description:
      "Slots de `duration` minutos (default 30, entre 5 y 480) según los horarios del profesional y sus turnos no cancelados, en hora de Argentina. Agenda interna: sin buffer ni anticipación mínima; si la fecha es hoy, descarta los horarios ya pasados. Día no atendido, sin horarios o bloqueado: `slots: []` + `message`.",
    tags: [TAGS.agenda],
    auth: { kind: "session" },
    mobile: true,
    request: {
      params: UserIdParam,
      query: z.object({
        date: IsoDate.describe("Día a consultar (hora de Argentina)."),
        duration: z.coerce.number().int().min(5).max(480).optional().describe("Minutos por slot; default 30."),
      }),
    },
    responses: {
      200: { description: "Grilla del día.", schema: ok(AvailableSlotsSchema) },
      ...errors({ 400: "Falta `date`, fecha inválida o duración fuera de rango." }, 401),
    },
  },
  {
    method: "get",
    path: "/api/users/{id}/has-schedule",
    summary: "¿El profesional tiene horarios cargados?",
    description: "true si al menos un día tiene alguna franja (AM o PM). Para avisar antes de intentar dar turnos.",
    tags: [TAGS.agenda],
    auth: { kind: "session" },
    mobile: true,
    request: { params: UserIdParam },
    responses: {
      200: { description: "Indicador.", schema: ok(UserHasScheduleSchema) },
      ...errors(401),
    },
  },
]);
