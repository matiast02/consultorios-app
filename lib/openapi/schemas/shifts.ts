// DTO compartidos de los turnos del registro OpenAPI (/api/shifts/**).
//
// La forma es la que DEVUELVEN las rutas (include de Prisma), no la de
// types/index.ts. Cada ruta anida un subconjunto distinto de relaciones: el
// listado trae teléfono y obra social del paciente, el POST/PUT no traen
// teléfono, el detalle trae el paciente completo. Por eso `Shift` tiene esos
// campos opcionales y el detalle es un DTO aparte (`ShiftDetail`).
// Se arman con objetos de campos (sin `.extend()`) para que el cliente
// generado no reciba `allOf`. `/api/patients/{id}/shifts` usa su propio DTO.

import { z } from "zod";
import { IsoDate, IsoDateTime } from "../registry";
import { ConsultationTypeSchema, HealthInsuranceSchema } from "./catalogs";
import { shiftStatusEnum } from "@/lib/validations";

// ─── Enums ───────────────────────────────────────────────────────────────────

/**
 * Estado del turno con ref "ShiftStatus". Se define UNA sola vez en todo el
 * registro (zod-openapi rechaza dos instancias con el mismo ref); los demás
 * módulos (dashboards, pacientes, público) lo importan de acá.
 */
export const ShiftStatusSchema = shiftStatusEnum.openapi({
  ref: "ShiftStatus",
  description: "PENDING (pendiente), CONFIRMED (confirmado), ABSENT (ausente), FINISHED (finalizado), CANCELLED (cancelado).",
});

/** Cómo se confirmó el turno. Hoy el código escribe `PATIENT_LINK` y `STAFF`; `PHONE` está previsto. */
export const ShiftConfirmedViaSchema = z.enum(["PATIENT_LINK", "STAFF", "PHONE"]).openapi({ ref: "ShiftConfirmedVia" });

export const ShiftSourceSchema = z.enum(["STAFF", "ONLINE"]).openapi({ ref: "ShiftSource" });

// ─── Campos escalares del turno (comunes a todas las rutas) ──────────────────

const shiftFields = {
  id: z.string(),
  userId: z.string().describe("Profesional del turno."),
  patientId: z.string(),
  start: IsoDateTime,
  end: IsoDateTime,
  observations: z.string().nullable().describe("Nota administrativa visible por recepción. Nunca contenido clínico."),
  status: ShiftStatusSchema,
  isOverbook: z.boolean().describe("Sobreturno: se creó ignorando el solapamiento con otro turno."),
  consultationTypeId: z.string().nullable(),
  recurrenceGroupId: z
    .string()
    .nullable()
    .describe("Serie de turnos recurrentes a la que pertenece (`GET /api/shifts/recurring/{groupId}`)."),
  rescheduledFrom: IsoDateTime.nullable().describe("Fecha original si el sistema lo reprogramó automáticamente."),
  rescheduledAt: IsoDateTime.nullable(),
  confirmedAt: IsoDateTime.nullable(),
  confirmedVia: ShiftConfirmedViaSchema.nullable(),
  source: ShiftSourceSchema.describe("STAFF: cargado por el consultorio. ONLINE: reserva web (entra PENDING y recepción confirma)."),
  arrivedAt: IsoDateTime.nullable().describe("El paciente llegó (sala de espera)."),
  consultationStartedAt: IsoDateTime.nullable().describe("El paciente pasó a consulta."),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
};

// ─── Relaciones anidadas ─────────────────────────────────────────────────────

export const ShiftMedicRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  })
  .openapi({ ref: "ShiftMedicRef" });

export const ShiftPatientRefSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    dni: z.string().nullable(),
    telephone: z
      .string()
      .nullable()
      .optional()
      .describe("Solo en `GET /api/shifts` y `GET /api/shifts/recurring/{groupId}`."),
    os: HealthInsuranceSchema.nullable().optional().describe("Obra social principal. Ausente en `GET /api/shifts/rescheduled`."),
    osNumber: z
      .string()
      .nullable()
      .optional()
      .describe("N° de afiliado. Solo en `GET /api/shifts` y `GET /api/shifts/recurring/{groupId}`."),
  })
  .openapi({ ref: "ShiftPatientRef" });

export const ShiftConsultationTypeRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    durationMinutes: z.number().int(),
    color: z.string().nullable(),
  })
  .openapi({ ref: "ShiftConsultationTypeRef" });

/** Turno como lo devuelven el listado, el alta, la edición, las series y los reprogramados. */
export const ShiftSchema = z
  .object({
    ...shiftFields,
    patient: ShiftPatientRefSchema,
    user: ShiftMedicRefSchema,
    consultationType: ShiftConsultationTypeRefSchema.nullable()
      .optional()
      .describe("Solo en `GET /api/shifts` y `POST /api/shifts`; ausente en el PUT, las series recurrentes y los reprogramados."),
  })
  .openapi({ ref: "Shift" });

// ─── Detalle (GET /api/shifts/{id}) ──────────────────────────────────────────

/** Paciente completo tal como lo devuelve `GET /api/shifts/{id}` (con su obra social). */
export const ShiftDetailPatientSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    birthDate: IsoDateTime.nullable(),
    sex: z.string().nullable().describe('"M", "F" o "X".'),
    dni: z.string().nullable(),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
    address: z.string().nullable(),
    country: z.string().nullable(),
    province: z.string().nullable(),
    osId: z.string().nullable(),
    osNumber: z.string().nullable().describe("N° de afiliado."),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    createdById: z.string().nullable().describe("Usuario que dio el alta; null en datos migrados."),
    deletedById: z.string().nullable(),
    consentType: z
      .enum(["WRITTEN", "VERBAL_RECORDED", "DIGITAL_SIGNATURE"])
      .nullable()
      .describe("Consentimiento para el tratamiento de datos de salud (Ley 25.326 art. 5-6)."),
    consentGivenAt: IsoDateTime.nullable(),
    consentNote: z.string().nullable().describe("Cómo se obtuvo / observaciones (cifrado en la base; se devuelve en claro)."),
    reminderOptOut: z.boolean().describe("El paciente pidió no recibir recordatorios de turnos."),
    reminderOptOutAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    deletedAt: IsoDateTime.nullable().describe("No null si el paciente fue archivado; el turno sigue siendo visible."),
    os: HealthInsuranceSchema.nullable(),
  })
  .openapi({ ref: "ShiftDetailPatient" });

export const ShiftDetailMedicRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    defaultRoom: z.string().nullable().describe('Consultorio asignado por defecto ("C1", "Sala A").'),
    specialization: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
  })
  .openapi({ ref: "ShiftDetailMedicRef" });

export const ShiftDetailSchema = z
  .object({
    ...shiftFields,
    patient: ShiftDetailPatientSchema,
    consultationType: ConsultationTypeSchema.nullable().describe("Tipo de consulta completo (sin `_count`)."),
    user: ShiftDetailMedicRefSchema,
  })
  .openapi({ ref: "ShiftDetail" });

/** `meta` de `GET /api/shifts/{id}?withContext=true`. */
export const ShiftContextSchema = z
  .object({
    lastVisit: z
      .object({
        date: IsoDateTime.describe("Inicio del último turno FINISHED anterior del paciente (con cualquier profesional)."),
        consultationTypeName: z.string().nullable(),
      })
      .nullable(),
    nextScheduled: z
      .object({
        date: IsoDateTime.describe("Próximo turno PENDING o CONFIRMED posterior del paciente."),
        consultationTypeName: z.string().nullable(),
        medicShortName: z.string().describe('"Dr. Apellido" / "Dra. Apellido", o el nombre completo si no hay apellido.'),
      })
      .nullable(),
  })
  .openapi({ ref: "ShiftContext" });

// ─── Alta ────────────────────────────────────────────────────────────────────

/** Advertencia no bloqueante de `POST /api/shifts`: el turno se creó igual. */
export const ShiftInsuranceWarningSchema = z
  .object({
    code: z.enum(["INSURANCE_MISMATCH"]),
    message: z.string().describe("Texto para mostrar: el paciente no tiene una obra social aceptada por el profesional; se atiende como particular."),
  })
  .openapi({ ref: "ShiftInsuranceWarning" });

/** 409 de `POST /api/shifts`. Solo el solapamiento trae `code` y `conflictDetails`. */
export const ShiftConflictErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.string().describe("Mensaje para mostrar (español)."),
    code: z.string().optional().describe("`SHIFT_CONFLICT` en el solapamiento; ausente en día bloqueado y fuera de horario."),
    conflictDetails: z
      .object({
        shiftId: z.string(),
        start: IsoDateTime,
        end: IsoDateTime,
        patient: z.string().describe('"Apellido, Nombre" del otro turno.'),
      })
      .optional(),
  })
  .openapi({ ref: "ShiftConflictError" });

// ─── Recepción (llegada, consulta) ───────────────────────────────────────────

export const ShiftArrivalSchema = z
  .object({
    id: z.string(),
    arrivedAt: IsoDateTime,
    status: ShiftStatusSchema.describe("No cambia al marcar la llegada."),
  })
  .openapi({ ref: "ShiftArrival" });

export const ShiftArrivalClearedSchema = z
  .object({
    id: z.string(),
    arrivedAt: IsoDateTime.nullable().describe("Siempre null."),
  })
  .openapi({ ref: "ShiftArrivalCleared" });

export const ShiftConsultationStartedSchema = z
  .object({
    id: z.string(),
    consultationStartedAt: IsoDateTime,
    arrivedAt: IsoDateTime.describe("Si no había llegada registrada, se setea ahora."),
  })
  .openapi({ ref: "ShiftConsultationStarted" });

// ─── Series recurrentes ──────────────────────────────────────────────────────

export const RecurringShiftSkippedSchema = z
  .object({
    date: IsoDate.describe("Fecha de la ocurrencia omitida."),
    reason: z.string().describe("Día bloqueado, fuera del horario de atención o conflicto con otro turno (texto para mostrar)."),
  })
  .openapi({ ref: "RecurringShiftSkipped" });

export const RecurringShiftsResultSchema = z
  .object({
    created: z.array(ShiftSchema).describe("Turnos creados (todos PENDING), sin `consultationType` anidado."),
    skipped: z.array(RecurringShiftSkippedSchema),
    recurrenceGroupId: z.string().nullable().describe("UUID de la serie; null si no se creó ninguna ocurrencia."),
  })
  .openapi({ ref: "RecurringShiftsResult" });

export const RecurringShiftsCancelledSchema = z
  .object({ cancelled: z.number().int().describe("Cantidad de turnos que pasaron a CANCELLED.") })
  .openapi({ ref: "RecurringShiftsCancelled" });
