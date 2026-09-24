// DTO compartidos del módulo de pacientes del registro OpenAPI.
//
// La forma es la que DEVUELVEN las rutas de app/api/patients/**: el registro
// Prisma completo de `Patient` con `include: { os: true }`, la obra social
// adicional (`PatientInsurance`) y el turno tal como lo lista
// GET /api/patients/{id}/shifts (`PatientShift`; el `Shift` de /api/shifts lo
// define el módulo de turnos). Los errores con campos extra (duplicado de DNI,
// baja bloqueada) tienen su propio schema porque no entran en `Error`.

import { z } from "zod";
import { shiftStatusEnum } from "@/lib/validations";
import { IsoDateTime } from "../registry";

// ─── Obra social embebida ────────────────────────────────────────────────────

/** Registro completo de `HealthInsurance` tal como viene embebido en el paciente (`os`) y en `PatientInsurance`. */
export const HealthInsuranceRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string().nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "HealthInsuranceRef" });

// ─── Paciente ────────────────────────────────────────────────────────────────

/** Cómo se obtuvo el consentimiento para tratar datos de salud (Ley 25.326 art. 5-6). */
export const PatientConsentTypeSchema = z
  .enum(["WRITTEN", "VERBAL_RECORDED", "DIGITAL_SIGNATURE"])
  .openapi({ ref: "PatientConsentType" });

export const PatientSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    birthDate: IsoDateTime.nullable().describe("Se guarda como DateTime; en el body del alta se envía como string de fecha (p. ej. `YYYY-MM-DD`)."),
    sex: z.string().nullable().describe('"M", "F" o "X" (el alta valida ese enum; la columna es texto libre).'),
    dni: z.string().nullable().describe("Único entre TODOS los pacientes, incluidos los archivados."),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
    address: z.string().nullable(),
    country: z.string().nullable(),
    province: z.string().nullable(),
    osId: z.string().nullable().describe("Obra social principal."),
    osNumber: z.string().nullable().describe("Número de afiliado de la obra social principal."),
    os: HealthInsuranceRefSchema.nullable().describe("Obra social principal (`osId`). Las adicionales van por `/api/patients/{id}/insurances`."),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    createdById: z.string().nullable().describe("Usuario que dio el alta (null en datos migrados). Define qué médico puede archivarlo o eliminarlo."),
    deletedById: z.string().nullable(),
    consentType: PatientConsentTypeSchema.nullable(),
    consentGivenAt: IsoDateTime.nullable(),
    consentNote: z.string().nullable().describe("Cómo se obtuvo el consentimiento / observaciones (cifrado en la base)."),
    reminderOptOut: z.boolean().describe("Oposición a recibir recordatorios de turnos (Ley 25.326 art. 27)."),
    reminderOptOutAt: IsoDateTime.nullable().describe("Cuándo se registró la oposición; se fija al activarla y se limpia al revocarla."),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    deletedAt: IsoDateTime.nullable().describe("Siempre null: ninguna ruta devuelve pacientes archivados (al restaurar ya viene en null)."),
  })
  .openapi({ ref: "Patient" });

// ─── Obras sociales adicionales ──────────────────────────────────────────────

export const PatientInsuranceSchema = z
  .object({
    id: z.string().describe("ID de la asignación (no de la obra social)."),
    healthInsuranceId: z.string(),
    healthInsurance: HealthInsuranceRefSchema,
    affiliateNumber: z.string().nullable(),
  })
  .openapi({ ref: "PatientInsurance" });

// ─── Turnos del paciente (GET /api/patients/{id}/shifts) ─────────────────────

export const PatientShiftUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  })
  .openapi({ ref: "PatientShiftUser" });

/** Turno tal como lo lista el historial del paciente: registro completo de `Shift` + profesional. */
export const PatientShiftSchema = z
  .object({
    id: z.string(),
    userId: z.string().describe("Profesional."),
    patientId: z.string(),
    start: IsoDateTime,
    end: IsoDateTime,
    observations: z.string().nullable().describe("Nota administrativa visible por recepción; nunca contenido clínico."),
    status: shiftStatusEnum,
    isOverbook: z.boolean().describe("Sobreturno."),
    consultationTypeId: z.string().nullable(),
    recurrenceGroupId: z.string().nullable().describe("Serie de turnos recurrentes."),
    rescheduledFrom: IsoDateTime.nullable().describe("Fecha original si lo movió un bloqueo de día."),
    rescheduledAt: IsoDateTime.nullable(),
    confirmedAt: IsoDateTime.nullable(),
    confirmedVia: z.enum(["PATIENT_LINK", "STAFF", "PHONE"]).nullable(),
    source: z.enum(["STAFF", "ONLINE"]).describe("ONLINE: reserva web confirmada por recepción."),
    arrivedAt: IsoDateTime.nullable().describe("Llegó al consultorio (sala de espera)."),
    consultationStartedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    user: PatientShiftUserSchema,
  })
  .openapi({ ref: "PatientShift" });

// ─── Errores y resultados propios de alta / edición / baja ───────────────────

/** 409 de POST y PUT /api/patients: el DNI ya está en uso. */
export const PatientDuplicateErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
    code: z.enum(["DUPLICATE", "ARCHIVED_DUPLICATE"]),
    archivedPatientId: z
      .string()
      .optional()
      .describe("Solo con `ARCHIVED_DUPLICATE`: id del paciente archivado, para ofrecer restaurarlo (`POST /api/patients/{id}/restore`, admin)."),
  })
  .openapi({ ref: "PatientDuplicateError" });

export const ProfessionalNameRefSchema = z
  .object({
    id: z.string(),
    name: z.string().describe('"Nombre Apellido" o el `name` del usuario.'),
  })
  .openapi({ ref: "ProfessionalNameRef" });

export const PatientDeletionBlockersSchema = z
  .object({
    clinicalEntries: z.number().int().describe("Asientos clínicos distintos (de cualquier autor), incluido el ledger."),
    otherProfessionals: z
      .array(ProfessionalNameRefSchema)
      .describe("Otros profesionales con asientos o turnos no cancelados. A roles no clínicos solo se les muestran los que surgen de turnos."),
    futureShiftsWithOthers: z.number().int().describe("Turnos futuros no cancelados con otros profesionales (bloquean también el archivo)."),
    canArchive: z.boolean().describe("Si el mismo actor podría archivar en vez de eliminar: sirve para ofrecer `?mode=archive`."),
  })
  .openapi({ ref: "PatientDeletionBlockers" });

/** 409 de DELETE /api/patients/{id}: el estado del paciente impide la operación. */
export const PatientDeletionBlockedErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
    code: z.enum(["PURGE_BLOCKED", "ARCHIVE_BLOCKED"]),
    blockers: PatientDeletionBlockersSchema,
  })
  .openapi({ ref: "PatientDeletionBlockedError" });

export const PatientDeletionResultSchema = z
  .object({
    id: z.string(),
    mode: z.enum(["purge", "archive"]),
    warnings: z
      .array(z.string())
      .optional()
      .describe("Solo `archive`: avisos para mostrar (otros profesionales involucrados, HC conservada, turnos futuros propios que siguen en agenda)."),
    otherProfessionals: z
      .array(ProfessionalNameRefSchema)
      .optional()
      .describe("Solo `archive`: profesionales con HC o turnos del paciente (filtrados por rol como en `blockers`)."),
  })
  .openapi({ ref: "PatientDeletionResult" });
