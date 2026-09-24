// DTO compartidos de los módulos clínicos del registro OpenAPI: ficha clínica,
// evoluciones, ledger, recetas, órdenes de estudio, planes alimentarios,
// medicamentos, concesiones de acceso y copia de HC.
//
// La forma es la que DEVUELVEN las rutas (select/include de Prisma y
// serializadores), no la de types/index.ts. Los enums salen de
// lib/clinical-grants-shared.ts y lib/hc-copy-shared.ts; los ítems (receta,
// orden, plan) reutilizan los schemas de lib/validations.ts con `ref`.

import { z } from "zod";
import {
  mealSectionSchema,
  prescriptionItemSchema,
  shiftStatusEnum,
  structuredAllergySchema,
  studyOrderItemSchema,
} from "@/lib/validations";
import {
  CONSENT_TYPES,
  GRANT_SCOPES,
  GRANT_SECTIONS,
  GRANT_STATUSES,
  RECORD_SECTIONS,
} from "@/lib/clinical-grants-shared";
import { HC_COPY_REQUESTER_TYPES, HC_COPY_STATUSES } from "@/lib/hc-copy-shared";
import { IsoDateTime } from "../registry";

// ─── Referencias a usuarios y pacientes ──────────────────────────────────────

/** Autor de un asiento (User): evoluciones, concesiones. */
export const ClinicalAuthorRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  })
  .openapi({ ref: "ClinicalAuthorRef" });

/** Autor con email (recetas y órdenes de estudio). */
export const ClinicalAuthorEmailRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  })
  .openapi({ ref: "ClinicalAuthorEmailRef" });

/** Autor de un plan alimentario (nutricionista). */
export const MealPlanAuthorRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  })
  .openapi({ ref: "MealPlanAuthorRef" });

export const ClinicalPatientRefSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  })
  .openapi({ ref: "ClinicalPatientRef" });

export const ClinicalPatientDniRefSchema = ClinicalPatientRefSchema.extend({
  dni: z.string().nullable(),
}).openapi({ ref: "ClinicalPatientDniRef" });

/** Turno asociado a una evolución. */
export const EvolutionShiftRefSchema = z
  .object({
    id: z.string(),
    start: IsoDateTime,
    end: IsoDateTime,
    status: shiftStatusEnum,
  })
  .openapi({ ref: "EvolutionShiftRef" });

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Secciones que puede abarcar una concesión PARTIAL. */
export const GrantSectionSchema = z.enum(GRANT_SECTIONS).openapi({ ref: "GrantSection" });
/** Secciones de la FICHA (subconjunto de GrantSection): campos de ClinicalRecord. */
export const RecordSectionSchema = z.enum(RECORD_SECTIONS).openapi({ ref: "RecordSection" });
export const GrantStatusSchema = z.enum(GRANT_STATUSES).openapi({ ref: "GrantStatus" });
export const GrantScopeSchema = z.enum(GRANT_SCOPES).openapi({ ref: "GrantScope" });
/** Cómo se obtuvo el consentimiento del paciente para la concesión. */
export const GrantConsentTypeSchema = z.enum(CONSENT_TYPES).openapi({ ref: "GrantConsentType" });

/** Estado clínico del estudio (distinto de la anulación del asiento). */
export const StudyOrderStatusSchema = z
  .enum(["PENDING", "COMPLETED", "CANCELLED"])
  .openapi({ ref: "StudyOrderStatus" });

/** Tipos de asiento versionados en el ledger (`ClinicalEntryVersion.entityType`). */
export const LedgerEntityTypeSchema = z
  .enum(["evolution", "clinical_record", "prescription", "study_order", "meal_plan", "attachment"])
  .openapi({ ref: "LedgerEntityType" });
export const LedgerActionSchema = z.enum(["created", "corrected", "annulled"]).openapi({ ref: "LedgerAction" });

export const HcCopyRequesterTypeSchema = z.enum(HC_COPY_REQUESTER_TYPES).openapi({ ref: "HcCopyRequesterType" });
export const HcCopyStatusSchema = z.enum(HC_COPY_STATUSES).openapi({ ref: "HcCopyStatus" });

// ─── Anulación lógica (común a todos los asientos con autor) ─────────────────

const annulment = {
  annulledAt: IsoDateTime.nullable().describe("Anulación lógica: el asiento no se borra, queda marcado."),
  annulReason: z.string().nullable().describe("Motivo de la anulación (cifrado en la base)."),
  annulledById: z.string().nullable(),
};

/** Body de las anulaciones (`DELETE` de evolución, receta, orden, plan). */
export const AnnulEntryRequestSchema = z
  .object({
    annulReason: z.string().trim().min(1).describe("Motivo de la anulación. Obligatorio; queda cifrado en el asiento y en el ledger."),
  })
  .openapi({ ref: "AnnulEntryRequest" });

/** Respuesta de las anulaciones. */
export const AnnulledEntrySchema = z
  .object({
    id: z.string(),
    annulled: z.literal(true),
  })
  .openapi({ ref: "AnnulledEntry" });

// ─── Ficha clínica y evoluciones ─────────────────────────────────────────────

export const StructuredAllergySchema = structuredAllergySchema.openapi({ ref: "StructuredAllergy" });

export const EvolutionSchema = z
  .object({
    id: z.string(),
    clinicalRecordId: z.string(),
    shiftId: z.string().nullable().describe("Turno asociado (relación 1:1: un turno tiene a lo sumo una evolución)."),
    userId: z.string().describe("Médico autor."),
    reason: z.string().nullable().describe("Motivo de consulta."),
    physicalExam: z.string().nullable(),
    diagnosis: z.string().nullable(),
    diagnosisCode: z.string().nullable().describe("Código CIE-10."),
    treatment: z.string().nullable(),
    indications: z.string().nullable(),
    notes: z.string().nullable(),
    ...annulment,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    user: ClinicalAuthorRefSchema,
    shift: EvolutionShiftRefSchema.nullable(),
    clinicalRecord: z
      .object({ id: z.string(), patientId: z.string() })
      .optional()
      .describe("Solo en el GET individual."),
  })
  .openapi({ ref: "Evolution" });

export const ClinicalRecordSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    bloodType: z.string().nullable().describe("A+, A-, B+, B-, AB+, AB-, O+, O-."),
    allergies: z.string().nullable().describe("Alergias en texto libre."),
    personalHistory: z.string().nullable().describe("Antecedentes personales."),
    familyHistory: z.string().nullable().describe("Antecedentes familiares."),
    currentMedication: z.string().nullable().describe("Medicación habitual."),
    notes: z.string().nullable(),
    customFields: z.string().nullable().describe("JSON con campos propios de la profesión."),
    heightCm: z.number().int().nullable(),
    weightKg: z
      .string()
      .nullable()
      .describe('Decimal serializado como string ("72.50"). En el body del PUT se envía como número.'),
    habitsTobacco: z.string().nullable(),
    habitsAlcohol: z.string().nullable(),
    habitsActivity: z.string().nullable(),
    habitsDiet: z.string().nullable(),
    structuredAllergies: z
      .string()
      .nullable()
      .describe("JSON de `StructuredAllergy[]` (en el PUT se envía como array). Único campo clínico visible sin relación."),
    odontogram: z.string().nullable().describe("JSON del odontograma (odontología)."),
    genogram: z.string().nullable().describe("JSON del genograma (psicología)."),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    evolutions: z
      .array(EvolutionSchema)
      .optional()
      .describe(
        "Solo en el GET: las evoluciones que el actor puede ver (propias + concesión; admin todas), más nuevas primero. Vacío en la vista redactada. Ausente en la respuesta del PUT.",
      ),
  })
  .openapi({ ref: "ClinicalRecord" });

// ─── Ledger ──────────────────────────────────────────────────────────────────

export const ClinicalLedgerVersionSchema = z
  .object({
    version: z.number().int().min(1),
    action: LedgerActionSchema,
    authorId: z.string().describe('"system-backfill" en versiones creadas por la migración.'),
    authorName: z.string(),
    reason: z.string().nullable().describe("Motivo de la corrección o anulación."),
    data: z.unknown().describe("Snapshot descifrado de los campos clínicos de esa versión (objeto JSON)."),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "ClinicalLedgerVersion" });

export const ClinicalLedgerIntegritySchema = z
  .object({
    valid: z.boolean().describe("La cadena de hashes recomputada coincide con la guardada."),
    brokenAtVersion: z.number().int().optional().describe("Primera versión inconsistente (solo si `valid` es false)."),
    versions: z.number().int(),
  })
  .openapi({ ref: "ClinicalLedgerIntegrity" });

export const ClinicalLedgerSchema = z
  .object({
    versions: z.array(ClinicalLedgerVersionSchema).describe("En orden ascendente de versión."),
    integrity: ClinicalLedgerIntegritySchema,
  })
  .openapi({ ref: "ClinicalLedger" });

// ─── Recetas, órdenes de estudio, planes, medicamentos ───────────────────────

export const PrescriptionItemSchema = prescriptionItemSchema.openapi({ ref: "PrescriptionItem" });

export const PrescriptionSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    userId: z.string().describe("Médico que receta."),
    shiftId: z.string().nullable(),
    items: z.string().describe("JSON de `PrescriptionItem[]` (cifrado en la base)."),
    diagnosis: z.string().nullable(),
    notes: z.string().nullable(),
    durationDays: z.number().int().describe("Vigencia en días desde `createdAt` (default 90); la UI calcula vigente/vencida."),
    ...annulment,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    user: ClinicalAuthorEmailRefSchema,
    patient: ClinicalPatientDniRefSchema.optional().describe("Solo en el GET individual."),
  })
  .openapi({ ref: "Prescription" });

export const StudyOrderItemSchema = studyOrderItemSchema.openapi({ ref: "StudyOrderItem" });

export const StudyOrderSchema = z
  .object({
    id: z.string(),
    userId: z.string().describe("Médico que ordena."),
    patientId: z.string(),
    shiftId: z.string().nullable(),
    items: z.string().describe("JSON de `StudyOrderItem[]` (cifrado en la base)."),
    status: StudyOrderStatusSchema,
    resultNotes: z.string().nullable().describe("Notas de resultados."),
    ...annulment,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    patient: ClinicalPatientRefSchema,
    user: ClinicalAuthorEmailRefSchema,
  })
  .openapi({ ref: "StudyOrder" });

export const MealSectionSchema = mealSectionSchema.openapi({ ref: "MealSection" });

export const MealPlanSchema = z
  .object({
    id: z.string(),
    userId: z.string().describe("Nutricionista autor."),
    patientId: z.string(),
    shiftId: z.string().nullable(),
    title: z.string(),
    targetCalories: z.number().int().nullable().describe("kcal/día."),
    proteinPct: z.number().int().nullable(),
    carbsPct: z.number().int().nullable(),
    fatPct: z.number().int().nullable(),
    hydration: z.string().nullable(),
    meals: z.string().describe("JSON de `MealSection[]` (cifrado en la base)."),
    avoidFoods: z.string().nullable(),
    supplements: z.string().nullable(),
    notes: z.string().nullable(),
    ...annulment,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    user: MealPlanAuthorRefSchema,
    patient: ClinicalPatientDniRefSchema.optional().describe("Solo en el GET individual."),
  })
  .openapi({ ref: "MealPlan" });

export const MedicationSchema = z
  .object({
    id: z.string(),
    name: z.string().describe("Nombre comercial (único)."),
    genericName: z.string().nullable(),
    presentation: z.string().nullable().describe('Ej.: "Comprimidos 500mg".'),
    category: z.string().nullable().describe('Ej.: "Analgésico".'),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "Medication" });

// ─── Concesiones de acceso a la HC ───────────────────────────────────────────

/** Qué puede hacer el actor sobre la concesión (fuente: `grantPermissions`). */
export const GrantPermissionsSchema = z
  .object({
    approve: z.boolean(),
    reject: z.boolean(),
    revoke: z.boolean(),
    cancel: z.boolean(),
  })
  .openapi({ ref: "GrantPermissions" });

export const ClinicalAccessGrantSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    patient: ClinicalPatientRefSchema,
    grantedToUserId: z.string().describe("Médico que recibe (o pidió) el acceso."),
    grantedTo: ClinicalAuthorRefSchema,
    requestedById: z.string(),
    decidedById: z.string().nullable(),
    decidedBy: ClinicalAuthorRefSchema.nullable(),
    revokedById: z.string().nullable(),
    revokedBy: ClinicalAuthorRefSchema.nullable(),
    status: GrantStatusSchema.describe("Estado EFECTIVO: una ACTIVE vencida llega como EXPIRED aunque el cron no la haya marcado."),
    isActive: z.boolean().describe("Vigente ahora: ACTIVE y `startsAt` ≤ ahora < `expiresAt`."),
    scope: GrantScopeSchema,
    sections: z.array(GrantSectionSchema).describe("Vacío con `scope: FULL`."),
    entryIds: z.array(z.string()).describe("Asientos puntuales concedidos (solo PARTIAL)."),
    reason: z.string().describe("Motivo clínico de la solicitud (cifrado en la base)."),
    consentType: GrantConsentTypeSchema.nullable(),
    consentEvidence: z.string().nullable(),
    consentAt: IsoDateTime.nullable(),
    startsAt: IsoDateTime.nullable(),
    expiresAt: IsoDateTime.nullable(),
    decidedAt: IsoDateTime.nullable(),
    decisionNote: z.string().nullable().describe("Motivo del rechazo u observación."),
    revokedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    permissions: GrantPermissionsSchema,
  })
  .openapi({ ref: "ClinicalAccessGrant" });

export const ClinicalAccessStatusSchema = z
  .object({
    isAdmin: z.boolean(),
    hasRelationship: z.boolean().describe("Tratante (asientos propios con el paciente) o admin: puede editar la ficha y decidir concesiones."),
    canDecide: z.boolean(),
    canRequest: z.boolean().describe("Médico sin relación, sin concesión vigente ni solicitud pendiente."),
    record: z.object({
      full: z.boolean().describe("Ve la ficha completa."),
      sections: z.array(RecordSectionSchema).describe("Secciones de la ficha visibles (todas si `full`)."),
    }),
    activeGrant: z
      .object({
        id: z.string(),
        scope: GrantScopeSchema,
        sections: z.array(GrantSectionSchema),
        entryIds: z.array(z.string()),
        startsAt: IsoDateTime,
        expiresAt: IsoDateTime,
      })
      .nullable(),
    pendingRequest: z
      .object({
        id: z.string(),
        scope: GrantScopeSchema,
        sections: z.array(GrantSectionSchema),
        createdAt: IsoDateTime,
      })
      .nullable(),
    pendingToDecide: z.number().int().describe("Solicitudes ajenas pendientes sobre este paciente que el actor puede decidir."),
  })
  .openapi({ ref: "ClinicalAccessStatus" });

// ─── Copia de HC para el paciente ────────────────────────────────────────────

export const HcCopyUserRefSchema = z
  .object({ id: z.string(), name: z.string() })
  .openapi({ ref: "HcCopyUserRef" });

export const HcCopyRequestSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    requesterType: HcCopyRequesterTypeSchema,
    requesterName: z.string(),
    requesterDni: z.string().nullable(),
    authorizationNote: z.string().nullable().describe("Cómo se acreditó el vínculo / la autorización (cifrado)."),
    reason: z.string().nullable().describe("Motivo declarado por el solicitante (cifrado)."),
    status: HcCopyStatusSchema,
    requestedAt: IsoDateTime,
    dueAt: IsoDateTime.describe("`requestedAt` + 48 h (Ley 26.529 art. 14)."),
    overdue: z.boolean().describe("PENDING con `dueAt` ya vencido."),
    registeredBy: HcCopyUserRefSchema.nullable(),
    deliveredAt: IsoDateTime.nullable(),
    deliveredBy: HcCopyUserRefSchema.nullable(),
    deliveryNote: z.string().nullable(),
    documentHash: z.string().nullable().describe("sha256 del contenido canónico de la copia entregada."),
  })
  .openapi({ ref: "HcCopyRequest" });

export const HcCopyRequestSummarySchema = z
  .object({
    id: z.string(),
    patient: ClinicalPatientDniRefSchema,
    requesterType: HcCopyRequesterTypeSchema,
    requesterName: z.string(),
    status: HcCopyStatusSchema,
    requestedAt: IsoDateTime,
    dueAt: IsoDateTime,
    deliveredAt: IsoDateTime.nullable(),
    overdue: z.boolean(),
  })
  .openapi({ ref: "HcCopyRequestSummary" });

/** Respuesta del listado global (dashboard del admin). */
export const HcCopyRequestsListSchema = z
  .object({
    items: z
      .array(HcCopyRequestSummarySchema)
      .describe("PENDING: por vencimiento (`dueAt` asc); otros estados: más recientes primero. Hasta `limit`."),
    count: z.number().int().describe("Total de solicitudes en ese estado (puede superar `items.length`)."),
    overdue: z.number().int().describe("Pendientes con el plazo de 48 h vencido (0 si `status` no es PENDING)."),
  })
  .openapi({ ref: "HcCopyRequestsList" });
