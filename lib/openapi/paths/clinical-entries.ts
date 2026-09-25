// Asientos clínicos con autor: recetas, órdenes de estudio, planes alimentarios;
// y el catálogo de medicamentos que usan las recetas.
// Política (lib/clinical-access.ts): lee el autor, el admin y quien tenga una
// concesión vigente que cubra la sección (`recetas`, `estudios`, `planes`) o el
// id del asiento; escribe/anula solo el autor. Nunca se borra: se anula
// (lógico) y cada cambio queda como versión en el ledger (ClinicalEntryVersion).
// Recetas y órdenes dependen además de que el módulo esté habilitado.

import { z } from "zod";
import {
  createMealPlanSchema,
  createMedicationSchema,
  createPrescriptionSchema,
  createStudyOrderSchema,
  updateMealPlanSchema,
  updateStudyOrderSchema,
} from "@/lib/validations";
import { defineRoutes, errors, IdParam, ok, TAGS } from "../registry";
import {
  AnnulEntryRequestSchema,
  AnnulledEntrySchema,
  MealPlanSchema,
  MealSectionSchema,
  MedicationSchema,
  PrescriptionItemSchema,
  PrescriptionSchema,
  StudyOrderItemSchema,
  StudyOrderSchema,
} from "../schemas/clinical";

/** Listados por paciente: `?patientId=` obligatorio (no hay paginación). */
const PatientIdQuery = z.object({ patientId: z.string().describe("ID del paciente (obligatorio).") });

// Mismos schemas que validan las rutas; los ítems llevan `ref` para que el
// cliente generado tenga las clases con las que parsear el JSON de `items`/`meals`.
const createPrescriptionBody = createPrescriptionSchema.extend({
  items: z.array(PrescriptionItemSchema).min(1).describe("Al menos un medicamento. Se guarda como JSON cifrado."),
});
const createStudyOrderBody = createStudyOrderSchema.extend({
  userId: z.string().min(1).describe("Requerido por el schema pero IGNORADO: el autor es siempre el usuario de la sesión."),
  items: z.array(StudyOrderItemSchema).min(1).describe("Al menos un estudio. Se guarda como JSON cifrado."),
});
const createMealPlanBody = createMealPlanSchema.extend({
  userId: z.string().min(1).describe("Requerido por el schema pero IGNORADO: el autor es siempre el usuario de la sesión."),
  meals: z.array(MealSectionSchema).min(1).describe("Al menos una comida. Se guarda como JSON cifrado."),
});
const updateMealPlanBody = updateMealPlanSchema.extend({
  userId: z.string().min(1).optional().describe("Ignorado."),
  patientId: z.string().min(1).optional().describe("Ignorado (el plan no cambia de paciente)."),
  meals: z.array(MealSectionSchema).min(1).optional(),
});

const readRule = (section: string, kind: string) =>
  `Leen el autor, el admin y quien tenga una concesión vigente que cubra \`${section}\` (o el id de ${kind}); la secretaria nunca.`;
const listRule = "Médico: los propios más los que cubra la concesión; admin: todos. Más nuevos primero, anulados incluidos (marcados). Audita `VIEW_SENSITIVE` por listado.";
const annulRule =
  "Solo el autor. No se borra: queda `annulledAt`/`annulReason`/`annulledById`, versión `annulled` en el ledger con el motivo (obligatorio) y audit `DELETE` sin texto clínico.";

export const clinicalEntriesRoutes = defineRoutes([
  // ─── Recetas ───────────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/prescriptions",
    summary: "Listar recetas de un paciente",
    description: `${readRule("recetas", "la receta")} ${listRule} Requiere el módulo \`prescriptions\` habilitado para el usuario. No verifica que el paciente exista (lista vacía).`,
    tags: [TAGS.prescriptions],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { query: PatientIdQuery },
    responses: {
      200: { description: "Recetas visibles para el actor (sin `patient`).", schema: ok(z.array(PrescriptionSchema)) },
      ...errors({ 400: "Falta `patientId`." }, 401, { 403: "Sin rol clínico o módulo de recetas no habilitado." }),
    },
  },
  {
    method: "post",
    path: "/api/prescriptions",
    summary: "Emitir una receta",
    description: [
      "Solo médicos con el módulo `prescriptions` habilitado. El autor es el usuario de la sesión.",
      "`durationDays` define la vigencia (default 90) desde `createdAt`; la UI calcula vigente/vencida.",
      "No valida que `patientId`/`shiftId` existan (un id inválido termina en 500). Versión 1 en el ledger; audita `CREATE` con `itemCount`.",
    ].join(" "),
    tags: [TAGS.prescriptions],
    auth: { kind: "session", roles: ["medic"] },
    mobile: true,
    request: { body: createPrescriptionBody },
    responses: {
      201: { description: "Receta creada.", schema: ok(PrescriptionSchema) },
      ...errors(400, 401, { 403: "Sin rol clínico, no es médico o módulo no habilitado." }),
    },
  },
  {
    method: "get",
    path: "/api/prescriptions/{id}",
    summary: "Detalle de una receta",
    description: `${readRule("recetas", "la receta")} Incluye \`patient\` (con DNI) para imprimir. Requiere el módulo \`prescriptions\`. Audita \`VIEW_SENSITIVE\` (con \`grantId\` si se lee por concesión).`,
    tags: [TAGS.prescriptions],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Receta con paciente y autor.", schema: ok(PrescriptionSchema) },
      ...errors(401, { 403: "Sin rol clínico o módulo no habilitado." }, { 404: "Receta inexistente o de otro autor sin concesión que la cubra (respuesta idéntica)." }),
    },
  },
  {
    method: "delete",
    path: "/api/prescriptions/{id}",
    summary: "Anular una receta (lógico, solo el autor)",
    description: `${annulRule} El admin la ve pero recibe 403; otro médico, 404. No exige el módulo habilitado.`,
    tags: [TAGS.prescriptions],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam, body: AnnulEntryRequestSchema },
    responses: {
      200: { description: "Receta anulada.", schema: ok(AnnulledEntrySchema) },
      ...errors({ 400: "Falta `annulReason`." }, 401, { 403: "No es el autor (incluye al admin)." }, { 404: "Receta inexistente o de otro médico." }, { 409: "Ya estaba anulada." }),
    },
  },

  // ─── Órdenes de estudio ────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/study-orders",
    summary: "Listar órdenes de estudio de un paciente",
    description: `${readRule("estudios", "la orden")} ${listRule} Requiere el módulo \`study_orders\`. No verifica que el paciente exista (lista vacía).`,
    tags: [TAGS.studyOrders],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { query: PatientIdQuery },
    responses: {
      200: { description: "Órdenes visibles para el actor.", schema: ok(z.array(StudyOrderSchema)) },
      ...errors({ 400: "Falta `patientId`." }, 401, { 403: "Sin rol clínico o módulo de estudios no habilitado." }),
    },
  },
  {
    method: "post",
    path: "/api/study-orders",
    summary: "Crear una orden de estudio",
    description: [
      "Médico o admin con el módulo `study_orders` habilitado (a diferencia de recetas y evoluciones, la ruta no exige ser médico).",
      "El autor es siempre el usuario de la sesión: el `userId` del body se ignora. Nace con `status: PENDING`.",
      "No valida que `patientId`/`shiftId` existan. Versión 1 en el ledger; audita `CREATE` con `itemCount`.",
    ].join(" "),
    tags: [TAGS.studyOrders],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { body: createStudyOrderBody },
    responses: {
      201: { description: "Orden creada.", schema: ok(StudyOrderSchema) },
      ...errors(400, 401, { 403: "Sin rol clínico o módulo no habilitado." }),
    },
  },
  {
    method: "get",
    path: "/api/study-orders/{id}",
    summary: "Detalle de una orden de estudio",
    description: `${readRule("estudios", "la orden")} Requiere el módulo \`study_orders\`. Audita \`VIEW_SENSITIVE\` (con \`grantId\` si se lee por concesión).`,
    tags: [TAGS.studyOrders],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Orden con paciente y autor.", schema: ok(StudyOrderSchema) },
      ...errors(401, { 403: "Sin rol clínico o módulo no habilitado." }, { 404: "Orden inexistente o de otro autor sin concesión que la cubra (respuesta idéntica)." }),
    },
  },
  {
    method: "put",
    path: "/api/study-orders/{id}",
    summary: "Actualizar estado y/o resultados de una orden (solo el autor)",
    description: [
      "Solo el autor: cualquier otro actor, incluido el admin, recibe 404. Los ítems no se editan.",
      "`status` es el estado clínico del estudio (PENDING → COMPLETED / CANCELLED), independiente de la anulación del asiento; una orden anulada no se edita.",
      "Versión `corrected` en el ledger; audita `UPDATE` con los campos tocados.",
    ].join(" "),
    tags: [TAGS.studyOrders],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam, body: updateStudyOrderSchema },
    responses: {
      200: { description: "Orden actualizada.", schema: ok(StudyOrderSchema) },
      ...errors(400, 401, { 403: "Sin rol clínico o módulo no habilitado." }, { 404: "Orden inexistente o no es el autor (incluye al admin)." }, { 409: "Orden anulada." }),
    },
  },
  {
    method: "delete",
    path: "/api/study-orders/{id}",
    summary: "Anular una orden de estudio (lógico, solo el autor)",
    description: `${annulRule} Aquí quien no es el autor (admin incluido) recibe 404. Requiere el módulo \`study_orders\`.`,
    tags: [TAGS.studyOrders],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam, body: AnnulEntryRequestSchema },
    responses: {
      200: { description: "Orden anulada.", schema: ok(AnnulledEntrySchema) },
      ...errors({ 400: "Falta `annulReason`." }, 401, { 403: "Sin rol clínico o módulo no habilitado." }, { 404: "Orden inexistente o no es el autor." }, { 409: "Ya estaba anulada." }),
    },
  },

  // ─── Planes alimentarios ───────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/meal-plans",
    summary: "Listar planes alimentarios de un paciente",
    description: `${readRule("planes", "el plan")} ${listRule} Requiere el módulo \`prescriptions\` habilitado (los planes no tienen módulo propio). No verifica que el paciente exista (lista vacía).`,
    tags: [TAGS.mealPlans],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { query: PatientIdQuery },
    responses: {
      200: { description: "Planes visibles para el actor (sin `patient`).", schema: ok(z.array(MealPlanSchema)) },
      ...errors({ 400: "Falta `patientId`." }, 401, { 403: "Sin rol clínico o módulo no habilitado." }),
    },
  },
  {
    method: "post",
    path: "/api/meal-plans",
    summary: "Crear un plan alimentario",
    description: [
      "Médico o admin con el módulo `prescriptions` habilitado (la ruta no exige ser médico).",
      "El autor es siempre el usuario de la sesión: el `userId` del body se ignora. No valida que `patientId`/`shiftId` existan.",
      "Versión 1 en el ledger; audita `CREATE` solo con `patientId` (el título puede describir la condición clínica).",
    ].join(" "),
    tags: [TAGS.mealPlans],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { body: createMealPlanBody },
    responses: {
      201: { description: "Plan creado.", schema: ok(MealPlanSchema) },
      ...errors(400, 401, { 403: "Sin rol clínico o módulo no habilitado." }),
    },
  },
  {
    method: "get",
    path: "/api/meal-plans/{id}",
    summary: "Detalle de un plan alimentario",
    description: `${readRule("planes", "el plan")} Incluye \`patient\` (con DNI). Requiere el módulo \`prescriptions\`. Audita \`VIEW_SENSITIVE\` (con \`grantId\` si se lee por concesión).`,
    tags: [TAGS.mealPlans],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Plan con paciente y autor.", schema: ok(MealPlanSchema) },
      ...errors(401, { 403: "Sin rol clínico o módulo no habilitado." }, { 404: "Plan inexistente o de otro autor sin concesión que lo cubra (respuesta idéntica)." }),
    },
  },
  {
    method: "put",
    path: "/api/meal-plans/{id}",
    summary: "Corregir un plan alimentario (solo el autor)",
    description: [
      "Solo el autor; el admin lo ve pero recibe 403, otro médico 404. Actualiza solo los campos enviados; un plan anulado es inmutable.",
      "Versión `corrected` en el ledger (sin motivo); audita `UPDATE` con los campos tocados. La respuesta no incluye `patient`.",
    ].join(" "),
    tags: [TAGS.mealPlans],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam, body: updateMealPlanBody },
    responses: {
      200: { description: "Plan corregido.", schema: ok(MealPlanSchema) },
      ...errors(400, 401, { 403: "No es el autor (incluye al admin), o módulo no habilitado." }, { 404: "Plan inexistente o de otro médico." }, { 409: "Plan anulado." }),
    },
  },
  {
    method: "delete",
    path: "/api/meal-plans/{id}",
    summary: "Anular un plan alimentario (lógico, solo el autor)",
    description: `${annulRule} El admin lo ve pero recibe 403; otro médico, 404. No exige el módulo habilitado.`,
    tags: [TAGS.mealPlans],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam, body: AnnulEntryRequestSchema },
    responses: {
      200: { description: "Plan anulado.", schema: ok(AnnulledEntrySchema) },
      ...errors({ 400: "Falta `annulReason`." }, 401, { 403: "No es el autor (incluye al admin)." }, { 404: "Plan inexistente o de otro médico." }, { 409: "Ya estaba anulado." }),
    },
  },

  // ─── Medicamentos (catálogo para las recetas) ──────────────────────────────
  {
    method: "get",
    path: "/api/medications",
    summary: "Buscar medicamentos del catálogo",
    description:
      "Cualquier usuario con sesión. Busca por nombre comercial o genérico (contiene, sin distinguir mayúsculas); sin `search` devuelve el inicio del catálogo. Máximo 50 resultados, ordenados por nombre. No es dato clínico: sin auditoría.",
    tags: [TAGS.catalogs, TAGS.prescriptions],
    auth: { kind: "session" },
    mobile: true,
    request: { query: z.object({ search: z.string().optional().describe("Texto a buscar en nombre comercial o genérico.") }) },
    responses: {
      200: { description: "Hasta 50 medicamentos.", schema: ok(z.array(MedicationSchema)) },
      ...errors(401),
    },
  },
  {
    method: "post",
    path: "/api/medications",
    summary: "Agregar un medicamento al catálogo",
    description: "Solo admin. El nombre comercial es único (409 si ya existe).",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["admin"] },
    request: { body: createMedicationSchema },
    responses: {
      201: { description: "Medicamento creado.", schema: ok(MedicationSchema) },
      ...errors(400, 401, 403, { 409: "Ya existe un medicamento con ese nombre." }),
    },
  },
]);
