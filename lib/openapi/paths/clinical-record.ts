// Historia clínica: /api/patients/{id}/clinical-record, evoluciones y ledger.
// Política de acceso en lib/clinical-access.ts: solo médico (asientos propios o
// concesión vigente) y admin; la secretaria nunca, salvo la vista redactada de
// la ficha (alergias estructuradas). Todo asiento se versiona en el ledger
// (ClinicalEntryVersion) y nunca se borra: se anula.

import { z } from "zod";
import { createEvolutionSchema, updateClinicalRecordSchema, updateEvolutionSchema } from "@/lib/validations";
import { defineRoutes, errors, ok, okPaginated, PatientIdParam, TAGS } from "../registry";
import {
  AnnulEntryRequestSchema,
  AnnulledEntrySchema,
  ClinicalLedgerSchema,
  ClinicalRecordSchema,
  EvolutionSchema,
  LedgerEntityTypeSchema,
  StructuredAllergySchema,
} from "../schemas/clinical";

const EvolutionParams = PatientIdParam.extend({ evolutionId: z.string().describe("ID de la evolución") });

/** Mismo schema que valida la ruta; `structuredAllergies` con `ref` para que el cliente tenga la clase. */
const updateClinicalRecordBody = updateClinicalRecordSchema.extend({
  structuredAllergies: z
    .array(StructuredAllergySchema)
    .nullable()
    .optional()
    .describe("Se guarda serializado como JSON; `[]` o `null` lo vacía."),
});

/** `updateEvolutionSchema` (parcial) + motivo de corrección que la ruta lee aparte. */
const updateEvolutionBody = updateEvolutionSchema.extend({
  correctionReason: z
    .string()
    .optional()
    .describe("Motivo de la corrección. No se guarda en la evolución: queda en la versión `corrected` del ledger."),
});

const evolutionRead =
  "Leen el autor, el admin y quien tenga una concesión vigente que cubra `evoluciones` (o el id del asiento); la secretaria nunca.";

export const clinicalRecordRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/patients/{id}/clinical-record",
    summary: "Ficha clínica del paciente (con sus evoluciones visibles)",
    description: [
      "La crea vacía si no existe (médico/admin). Qué se ve depende del actor:",
      "**completa** para admin, médico tratante (con al menos un asiento propio) o concesión FULL;",
      "**parcial** con una concesión PARTIAL (solo los campos de las secciones concedidas: antecedentes, alergias, medicación);",
      "**redactada** para un médico sin relación y para la secretaria (solo `structuredAllergies`, dato de seguridad; el resto llega en `null` y `evolutions: []`).",
      "Para la secretaria no se crea la ficha: si no existe, `data` es `null`.",
      "`evolutions` trae las propias del médico más las que cubra su concesión (admin: todas), más nuevas primero.",
      "Audita `VIEW_SENSITIVE` cuando la ficha tiene datos o se lee por concesión (`details.grantId`).",
    ].join(" "),
    tags: [TAGS.clinicalRecord],
    auth: { kind: "session", roles: ["medic", "secretary", "admin"] },
    mobile: true,
    request: { params: PatientIdParam },
    responses: {
      200: {
        description: "Ficha (completa, parcial o redactada según el actor); `null` solo para la secretaria sin ficha creada.",
        schema: ok(ClinicalRecordSchema.nullable()),
      },
      ...errors(401, { 403: "Rol sin acceso a datos clínicos (ni médico, ni admin, ni secretaria)." }, { 404: "Paciente inexistente o archivado." }),
    },
  },
  {
    method: "put",
    path: "/api/patients/{id}/clinical-record",
    summary: "Editar la ficha clínica",
    description: [
      "Solo el médico tratante (con al menos un asiento propio con el paciente) o el admin; una concesión nunca habilita a escribir.",
      "Actualiza solo los campos enviados (upsert). `weightKg` se envía como número y vuelve como string decimal.",
      "Cada guardado agrega una versión al ledger (`created` la primera vez, `corrected` después) y audita `UPDATE`.",
      "La respuesta no incluye `evolutions`.",
    ].join(" "),
    tags: [TAGS.clinicalRecord],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: PatientIdParam, body: updateClinicalRecordBody },
    responses: {
      200: { description: "Ficha actualizada.", schema: ok(ClinicalRecordSchema) },
      ...errors(400, 401, { 403: "Sin rol clínico, o médico sin relación clínica con el paciente." }, { 404: "Paciente inexistente o archivado." }),
    },
  },
  {
    method: "get",
    path: "/api/patients/{id}/evolutions",
    summary: "Listar evoluciones del paciente (paginado)",
    description: `${evolutionRead} Médico: sus evoluciones más las que cubra la concesión; admin: todas. Más nuevas primero. \`search\` busca en diagnóstico, motivo y código CIE-10. Si el paciente aún no tiene ficha responde lista vacía. Audita \`VIEW_SENSITIVE\` por listado.`,
    tags: [TAGS.clinicalRecord],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: {
      params: PatientIdParam,
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        search: z.string().optional().describe("Texto a buscar en diagnóstico, motivo o código CIE-10."),
      }),
    },
    responses: {
      200: { description: "Evoluciones visibles para el actor.", schema: okPaginated(EvolutionSchema) },
      ...errors(401, 403, { 404: "Paciente inexistente o archivado." }),
    },
  },
  {
    method: "post",
    path: "/api/patients/{id}/evolutions",
    summary: "Registrar una evolución",
    description: [
      "Solo médicos (el admin custodia la HC pero no escribe). Crea la ficha del paciente si no existe.",
      "Con `shiftId`, el turno debe ser de ese paciente y no tener ya una evolución (relación 1:1).",
      "Queda como versión 1 en el ledger; audita `CREATE` solo con `patientId`.",
    ].join(" "),
    tags: [TAGS.clinicalRecord],
    auth: { kind: "session", roles: ["medic"] },
    mobile: true,
    request: { params: PatientIdParam, body: createEvolutionSchema },
    responses: {
      201: { description: "Evolución creada.", schema: ok(EvolutionSchema) },
      ...errors(
        400,
        401,
        { 403: "Sin rol clínico o no es médico." },
        { 404: "Paciente inexistente/archivado, o `shiftId` no es un turno de ese paciente." },
        { 409: "El turno ya tiene una evolución asociada." },
      ),
    },
  },
  {
    method: "get",
    path: "/api/patients/{id}/evolutions/{evolutionId}",
    summary: "Detalle de una evolución",
    description: `${evolutionRead} Incluye \`clinicalRecord { id, patientId }\`. Audita \`VIEW_SENSITIVE\` (con \`grantId\` si se lee por concesión).`,
    tags: [TAGS.clinicalRecord],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: EvolutionParams },
    responses: {
      200: { description: "Evolución.", schema: ok(EvolutionSchema) },
      ...errors(401, 403, { 404: "Paciente o evolución inexistente, o evolución de otro autor sin concesión que la cubra (respuesta idéntica)." }),
    },
  },
  {
    method: "put",
    path: "/api/patients/{id}/evolutions/{evolutionId}",
    summary: "Corregir una evolución (solo el autor)",
    description: [
      "Solo el médico que la creó; el admin la ve pero recibe 403 al editar, y otro médico 404.",
      "Una evolución anulada es inmutable. Si cambia `shiftId`, aplican las mismas reglas del alta.",
      "El snapshot anterior se conserva: se agrega una versión `corrected` al ledger con `correctionReason`. Audita `UPDATE`.",
    ].join(" "),
    tags: [TAGS.clinicalRecord],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: EvolutionParams, body: updateEvolutionBody },
    responses: {
      200: { description: "Evolución corregida.", schema: ok(EvolutionSchema) },
      ...errors(
        400,
        401,
        { 403: "No es el autor (incluye al admin)." },
        { 404: "Evolución inexistente o de otro médico, o `shiftId` no es un turno de ese paciente." },
        { 409: "Evolución anulada, o el nuevo turno ya tiene otra evolución." },
      ),
    },
  },
  {
    method: "delete",
    path: "/api/patients/{id}/evolutions/{evolutionId}",
    summary: "Anular una evolución (lógico, solo el autor)",
    description:
      "No se borra: queda marcada con `annulledAt`, `annulReason` y `annulledById`, visible para autor y admin. Versión `annulled` en el ledger con el motivo; audita `DELETE` sin texto clínico. El motivo es obligatorio.",
    tags: [TAGS.clinicalRecord],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: EvolutionParams, body: AnnulEntryRequestSchema },
    responses: {
      200: { description: "Evolución anulada.", schema: ok(AnnulledEntrySchema) },
      ...errors(
        { 400: "Falta `annulReason`." },
        401,
        { 403: "No es el autor (incluye al admin)." },
        { 404: "Evolución inexistente o de otro médico." },
        { 409: "Ya estaba anulada." },
      ),
    },
  },
  {
    method: "get",
    path: "/api/clinical-ledger",
    summary: "Historial de versiones de un asiento e integridad de la cadena",
    description: [
      "Versiones inmutables (`ClinicalEntryVersion`) de una evolución, ficha, receta, orden, plan o adjunto: snapshot descifrado, autor, acción y motivo, en orden ascendente, más la verificación de la cadena de hashes.",
      "Médico: asientos propios o cubiertos por una concesión vigente sobre el paciente dueño; la ficha solo si es tratante o tiene concesión FULL (sus snapshots son completos).",
      "Admin: todo, incluso si el asiento ya no existe (el ledger lo sobrevive). Audita `VIEW_SENSITIVE`.",
    ].join(" "),
    tags: [TAGS.clinicalRecord, TAGS.audit],
    auth: { kind: "session", roles: ["medic", "admin"] },
    request: {
      query: z.object({
        entityType: LedgerEntityTypeSchema,
        entityId: z.string().describe("ID del asiento (evolución, ficha, receta, orden, plan o adjunto)."),
      }),
    },
    responses: {
      200: { description: "Versiones e integridad.", schema: ok(ClinicalLedgerSchema) },
      ...errors(
        { 400: "`entityType` inválido o falta `entityId`." },
        401,
        403,
        { 404: "Asiento inexistente o no visible para el actor (respuesta idéntica)." },
      ),
    },
  },
]);
