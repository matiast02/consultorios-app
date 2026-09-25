// Pacientes: /api/patients/**, /api/patients/find/{dni}.
// Datos administrativos (sin contenido clínico): cualquier rol con sesión lee y
// edita; la baja y la restauración tienen reglas por rol y autoría
// (lib/patient-deletion.ts). DTO en ../schemas/patients.ts.

import { z } from "zod";
import { createPatientSchema, paginationSchema, updatePatientSchema } from "@/lib/validations";
import { defineRoutes, errors, ok, okPaginated, PatientIdParam, TAGS } from "../registry";
import {
  PatientDeletionBlockedErrorSchema,
  PatientDeletionResultSchema,
  PatientDuplicateErrorSchema,
  PatientInsuranceSchema,
  PatientSchema,
  PatientShiftSchema,
} from "../schemas/patients";

const patientsQuerySchema = paginationSchema.extend({
  search: z
    .string()
    .optional()
    .describe(
      "Nombre, apellido y/o DNI. Varias palabras se combinan con AND sobre nombre/apellido/DNI; el DNI se normaliza a dígitos (`28.456.789` encuentra `28456789`). Sin distinguir mayúsculas ni acentos.",
    ),
});

const dniConflict = {
  409: "DNI en uso: `DUPLICATE` (paciente activo) o `ARCHIVED_DUPLICATE` (archivado; trae `archivedPatientId` y solo el admin puede restaurarlo).",
};

export const patientsRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/patients",
    summary: "Listar o buscar pacientes",
    description:
      "Solo pacientes activos (no archivados), ordenados por apellido, con la obra social principal embebida. Sin datos clínicos: cualquier rol.",
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: { query: patientsQuerySchema },
    responses: {
      200: { description: "Página de pacientes.", schema: okPaginated(PatientSchema) },
      ...errors({ 400: "Paginación inválida (`page` ≥ 1, `limit` 1-100)." }, 401),
    },
  },
  {
    method: "post",
    path: "/api/patients",
    summary: "Dar de alta un paciente",
    description: [
      "Cualquier rol. `birthDate` y `consentGivenAt` se envían como string de fecha/ISO y se guardan como DateTime.",
      "El DNI es único incluso contra archivados (409). Guarda `createdById` (define qué médico podrá archivarlo/eliminarlo) y, si viene `reminderOptOut: true`, fija `reminderOptOutAt` en ahora.",
      "El consentimiento (Ley 25.326) se carga acá o en la edición. Audita `CREATE`.",
    ].join(" "),
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: { body: createPatientSchema },
    responses: {
      201: { description: "Paciente creado.", schema: ok(PatientSchema) },
      ...errors(400, 401),
      409: { description: dniConflict[409], schema: PatientDuplicateErrorSchema },
    },
  },
  {
    method: "get",
    path: "/api/patients/{id}",
    summary: "Ficha administrativa del paciente",
    description: "Datos personales, contacto, obra social principal y consentimiento; sin contenido clínico (eso va por la historia clínica). Cualquier rol. 404 si está archivado.",
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: { params: PatientIdParam },
    responses: {
      200: { description: "Paciente.", schema: ok(PatientSchema) },
      ...errors(401, { 404: "No existe o está archivado." }),
    },
  },
  {
    method: "put",
    path: "/api/patients/{id}",
    summary: "Editar un paciente",
    description: [
      "Actualización parcial: mismos campos del alta, todos opcionales (`null` limpia los anulables). Cualquier rol; 404 si está archivado.",
      "Cambiar el DNI aplica la misma unicidad que el alta (409). `reminderOptOut: true` fija `reminderOptOutAt` solo si no estaba activa; `false` la limpia.",
      "Audita `UPDATE` con la lista de campos enviados (no los valores).",
    ].join(" "),
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: { params: PatientIdParam, body: updatePatientSchema },
    responses: {
      200: { description: "Paciente actualizado.", schema: ok(PatientSchema) },
      ...errors(400, 401, { 404: "No existe o está archivado." }),
      409: { description: dniConflict[409], schema: PatientDuplicateErrorSchema },
    },
  },
  {
    method: "delete",
    path: "/api/patients/{id}",
    summary: "Archivar (default) o eliminar definitivamente un paciente",
    description: [
      "**`mode=archive`** (default): baja lógica; la historia clínica se conserva (10 años) y el admin puede restaurar. Pueden: admin siempre; el médico que dio el alta solo si no hay asientos clínicos ni turnos de otros profesionales; la secretaría nunca. Un turno futuro no cancelado con otro profesional bloquea a todos (409 `ARCHIVE_BLOCKED`).",
      "**`mode=purge`**: borrado físico (cascada sobre turnos e historia). Pueden admin, secretaría o el médico creador, y solo si no hay ningún asiento clínico y no hay turnos no cancelados (médico: con otros profesionales; secretaría/admin: ninguno). Si no, 409 `PURGE_BLOCKED` con `blockers`; `blockers.canArchive` dice si conviene ofrecer archivar.",
      "El permiso por rol/autoría se evalúa antes de mirar datos clínicos (403 `FORBIDDEN`); la evaluación y la mutación van en la misma transacción. A roles no clínicos, `otherProfessionals` solo muestra los que surgen de turnos. Audita `DELETE` con el modo.",
    ].join("\n\n"),
    tags: [TAGS.patients],
    auth: { kind: "session" },
    request: {
      params: PatientIdParam,
      query: z.object({ mode: z.enum(["purge", "archive"]).optional().describe("Default `archive`.") }),
    },
    responses: {
      200: {
        description: "Hecho. Con `archive` trae `warnings` y `otherProfessionals` para mostrar.",
        schema: ok(PatientDeletionResultSchema),
      },
      ...errors(
        { 400: "`mode` inválido (purge | archive)." },
        401,
        { 403: "El rol o la autoría no permiten esta operación (`code: FORBIDDEN`; `error` explica a quién pedírselo)." },
        { 404: "No existe o ya está archivado." },
      ),
      409: {
        description: "El estado del paciente bloquea la operación (`PURGE_BLOCKED` / `ARCHIVE_BLOCKED`); ver `blockers`.",
        schema: PatientDeletionBlockedErrorSchema,
      },
    },
  },
  {
    method: "post",
    path: "/api/patients/{id}/restore",
    summary: "Restaurar un paciente archivado (solo admin)",
    description:
      "Quita la baja lógica (`deletedAt`/`deletedById` en null). 409 `NOT_ARCHIVED` si no está archivado; 409 `DUPLICATE` si mientras tanto un paciente activo tomó su DNI. Audita `UPDATE` (`restored: true`).",
    tags: [TAGS.patients],
    auth: { kind: "session", roles: ["admin"] },
    request: { params: PatientIdParam },
    responses: {
      200: { description: "Paciente restaurado (vuelve a aparecer en listados y búsquedas).", schema: ok(PatientSchema) },
      ...errors(401, { 403: "No es admin (`code: FORBIDDEN`)." }, 404, { 409: "`NOT_ARCHIVED` (no estaba archivado) o `DUPLICATE` (el DNI lo usa un paciente activo)." }),
    },
  },
  {
    method: "get",
    path: "/api/patients/find/{dni}",
    summary: "Buscar un paciente por DNI",
    description:
      "Del parámetro se toman solo los dígitos (`28.456.789` equivale a `28456789`); 400 si no queda ninguno. Solo pacientes activos. Útil antes de un alta (evitar duplicados) y al recibir al paciente.",
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: { params: z.object({ dni: z.string().describe("DNI; se aceptan puntos, guiones y espacios.") }) },
    responses: {
      200: { description: "Paciente con ese DNI.", schema: ok(PatientSchema) },
      ...errors({ 400: "El parámetro no tiene dígitos." }, 401, { 404: "Ningún paciente activo con ese DNI." }),
    },
  },
  {
    method: "get",
    path: "/api/patients/{id}/insurances",
    summary: "Obras sociales adicionales del paciente",
    description:
      "Coberturas adicionales (`PatientInsurance`), distintas de la obra social principal `osId`/`osNumber` de la ficha. No verifica que el paciente exista: para un id desconocido o archivado responde lista vacía. Cualquier rol.",
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: { params: PatientIdParam },
    responses: {
      200: { description: "Obras sociales asignadas (sin orden garantizado).", schema: ok(z.array(PatientInsuranceSchema)) },
      ...errors(401),
    },
  },
  {
    method: "post",
    path: "/api/patients/{id}/insurances",
    summary: "Asignar una obra social adicional al paciente",
    description:
      "Solo valida que `healthInsuranceId` sea un string no vacío; `affiliateNumber` se guarda tal cual (o null). 404 si el paciente activo o la obra social no existen; 409 si ya estaba asignada. Cualquier rol; sin auditoría.",
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: {
      params: PatientIdParam,
      body: z.object({
        healthInsuranceId: z.string().min(1),
        affiliateNumber: z.string().nullable().optional().describe("Número de afiliado en esa obra social."),
      }),
    },
    responses: {
      201: { description: "Asignación creada.", schema: ok(PatientInsuranceSchema) },
      ...errors({ 400: "Falta `healthInsuranceId`." }, 401, { 404: "Paciente (activo) u obra social inexistente." }, { 409: "El paciente ya tiene esa obra social asignada." }),
    },
  },
  {
    method: "delete",
    path: "/api/patients/{id}/insurances",
    summary: "Quitar una obra social adicional del paciente",
    description: "La obra social a quitar va en el body (`healthInsuranceId`). No verifica que el paciente esté activo. Cualquier rol; sin auditoría.",
    tags: [TAGS.patients],
    auth: { kind: "session" },
    mobile: true,
    request: { params: PatientIdParam, body: z.object({ healthInsuranceId: z.string().min(1) }) },
    responses: {
      200: { description: "Asignación eliminada (`id` de la asignación).", schema: ok(z.object({ id: z.string() })) },
      ...errors({ 400: "Falta `healthInsuranceId`." }, 401, { 404: "El paciente no tiene esa obra social asignada." }),
    },
  },
  {
    method: "get",
    path: "/api/patients/{id}/shifts",
    summary: "Historial de turnos del paciente",
    description:
      "Todos los turnos del paciente, de cualquier profesional y estado, más recientes primero, con el profesional embebido. `page`/`limit` se leen sin validar (default 1 y 20, sin tope). 404 si el paciente está archivado. Sin contenido clínico (`observations` es nota administrativa). Cualquier rol.",
    tags: [TAGS.shifts],
    auth: { kind: "session" },
    mobile: true,
    request: {
      params: PatientIdParam,
      query: z.object({
        page: z.coerce.number().int().optional().describe("Default 1."),
        limit: z.coerce.number().int().optional().describe("Default 20; sin máximo."),
      }),
    },
    responses: {
      200: { description: "Página de turnos.", schema: okPaginated(PatientShiftSchema) },
      ...errors(401, { 404: "Paciente inexistente o archivado." }),
    },
  },
]);
