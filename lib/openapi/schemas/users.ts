// DTO compartidos de usuarios del registro OpenAPI: el usuario como lo ven las
// rutas de administración (/api/users/**), el perfil / preferencias /
// notificaciones del usuario logueado (/api/user/**), la disponibilidad de un
// profesional para dar turnos y la llegada espontánea (walk-in) de recepción.
//
// La forma es la que DEVUELVEN las rutas (select/include de Prisma), no la de
// types/index.ts. Se arman con objetos de campos (sin `.extend()`) para que el
// cliente generado no reciba `allOf`; cuando se reusan campos de un DTO con ref
// de otro módulo se toma su `.shape` (o el de un `.omit()`) dentro de un
// `z.object` nuevo, para no arrastrar el ref ajeno.

import { z } from "zod";
import { IsoDateTime } from "../registry";
import { BlockDaySchema, UserPreferenceSchema } from "./agenda";
import { ClinicalRecordSchema, EvolutionSchema, PrescriptionSchema, StudyOrderSchema } from "./clinical";
import { HealthInsuranceRefSchema, PatientSchema } from "./patients";
import { ShiftSchema } from "./shifts";

// ─── Referencias anidadas ────────────────────────────────────────────────────

export const UserRoleRefSchema = z
  .object({
    id: z.string(),
    name: z.enum(["medic", "secretary", "admin"]),
  })
  .openapi({ ref: "UserRoleRef" });

/** Especialidad embebida en el usuario. `color` solo viene en el listado. */
export const UserSpecializationRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z
      .string()
      .nullable()
      .optional()
      .describe('Hex "#RRGGBB" del profesional en la agenda. Solo en `GET /api/users`; ausente en el detalle, la edición y el perfil.'),
  })
  .openapi({ ref: "UserSpecializationRef" });

// ─── Usuario (administración) ────────────────────────────────────────────────

/** Usuario como lo devuelven `GET /api/users`, `GET /api/users/{id}` y `PUT /api/users/{id}`. */
export const UserSchema = z
  .object({
    id: z.string(),
    name: z.string().describe("Nombre para mostrar (puede ser vacío)."),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    licenseNumber: z
      .string()
      .nullable()
      .optional()
      .describe("Matrícula profesional. Ausente en `GET /api/users`; presente en el detalle y en la edición."),
    email: z.string().email(),
    isActive: z.boolean().describe("false: deshabilitado por el admin (no puede iniciar sesión; sus sesiones fueron revocadas)."),
    specialization: UserSpecializationRefSchema.nullable(),
    image: z.string().nullable(),
    roles: z.array(UserRoleRefSchema).describe("Roles aplanados (`{ id, name }`). En la práctica un usuario tiene exactamente uno."),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "User" });

// ─── Profesionales para formularios (GET /api/users/medics) ──────────────────

export const MedicSpecializationRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    professionConfig: z
      .object({ name: z.string().describe('"Médico", "Psicólogo", "Odontólogo", …') })
      .nullable()
      .describe("Profesión de la especialidad, para etiquetar; null si no tiene configuración."),
  })
  .openapi({ ref: "MedicSpecializationRef" });

export const MedicRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().email(),
    specialization: MedicSpecializationRefSchema.nullable(),
    image: z.string().nullable(),
  })
  .openapi({ ref: "MedicRef" });

// ─── Perfil del usuario logueado (/api/user/profile) ─────────────────────────

export const UserProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email().describe("No se puede cambiar desde el perfil."),
    image: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    officeAddress: z.string().nullable(),
    bio: z.string().nullable().describe("Hasta 280 caracteres."),
    licenseNumber: z.string().nullable().describe("Matrícula profesional."),
    specializationId: z.string().nullable(),
    specialization: UserSpecializationRefSchema.nullable(),
    isActive: z.boolean(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "UserProfile" });

/** Respuesta del `PATCH /api/user/profile`: subconjunto del perfil (sin imagen, especialidad embebida ni fechas). */
export const UserProfileUpdatedSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    officeAddress: z.string().nullable(),
    bio: z.string().nullable(),
    licenseNumber: z.string().nullable(),
    specializationId: z.string().nullable(),
  })
  .openapi({ ref: "UserProfileUpdated" });

// ─── Notificaciones y preferencias del usuario logueado ──────────────────────

export const UserNotificationsSchema = z
  .object({
    notifyReminder24h: z.boolean().describe("Hoy solo se guarda: los recordatorios al paciente se programan por consultorio."),
    notifyReminder2h: z.boolean().describe("Hoy solo se guarda."),
    notifyNewShift: z.boolean().describe("Notificación interna al profesional cuando entra una reserva online."),
    notifyCancellation: z.boolean().describe("Notificación interna al profesional cuando el paciente cancela una reserva online."),
    notifyWeeklySummary: z.boolean().describe("Hoy solo se guarda."),
    notifySmsFallback: z.boolean().describe("Hoy solo se guarda (no hay envío por SMS)."),
  })
  .openapi({ ref: "UserNotifications" });

export const UserPreferencesConfigSchema = z
  .object({
    slotDurationMinutes: z
      .number()
      .int()
      .describe("Duración por defecto del turno en minutos (5-240). La usan los dashboards (huecos libres) y la reserva online."),
    bufferMinutes: z
      .number()
      .int()
      .describe("Minutos entre turnos (0-60). Solo la reserva online lo aplica; la agenda interna (`available-slots`) no."),
    minAdvanceMinutes: z
      .number()
      .int()
      .describe("Anticipación mínima para reservar, en minutos (0-43200). Solo la reserva online lo aplica."),
    acceptsOnlineBooking: z.boolean().describe("Si el profesional aparece en la reserva web pública (/reservar)."),
    language: z.string().describe('Etiqueta BCP 47 (default "es-AR"). Hoy solo se guarda.'),
    timezone: z.string().describe('Zona IANA (default "America/Argentina/Buenos_Aires"). Hoy solo se guarda: la agenda calcula en hora AR fija.'),
    weekStart: z.number().int().min(0).max(6).describe("0 = domingo, 1 = lunes (default). Hoy solo se guarda."),
  })
  .openapi({ ref: "UserPreferencesConfig" });

// ─── Obras sociales que atiende el profesional (/api/users/{id}/insurances) ──

export const UserAcceptedInsuranceSchema = z
  .object({
    insuranceId: z.string().describe("ID de la obra social (`HealthInsurance`)."),
    copago: z.number().int().describe("Copago en pesos (entero ≥ 0; 0 si no cobra)."),
    healthInsurance: HealthInsuranceRefSchema,
  })
  .openapi({ ref: "UserAcceptedInsurance" });

/** GET/PUT /api/users/{id}/insurances. No usa `ok()`: además de `data` trae `accepted` al mismo nivel. */
export const UserInsurancesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(HealthInsuranceRefSchema).describe("Obras sociales aceptadas, por nombre (forma histórica, sin copago)."),
  accepted: z.array(UserAcceptedInsuranceSchema).describe("Las mismas obras sociales, con el copago."),
});

// ─── Disponibilidad (/api/users/{id}/availability, available-slots, has-schedule) ──

export const UserAvailabilitySchema = z
  .object({
    userId: z.string(),
    month: z.number().int().min(1).max(12),
    year: z.number().int(),
    preferences: z.array(UserPreferenceSchema).describe("Horarios de todos los días configurados (no dependen del mes), por `day`."),
    blockDays: z.array(BlockDaySchema).describe("Solo los del mes pedido, por fecha."),
  })
  .openapi({ ref: "UserAvailability" });

export const AvailableSlotSchema = z
  .object({
    start: z.string().describe('"HH:mm" en hora de Argentina.'),
    end: z.string().describe('"HH:mm".'),
    available: z.boolean().describe("false: se superpone con un turno no cancelado del profesional."),
  })
  .openapi({ ref: "AvailableSlot" });

export const WorkHoursRangeSchema = z
  .object({ from: z.string().describe('"HH:mm"'), to: z.string().describe('"HH:mm"') })
  .openapi({ ref: "WorkHoursRange" });

export const AvailableSlotsWorkHoursSchema = z
  .object({
    am: WorkHoursRangeSchema.nullable().describe("Franja de la mañana; null si no atiende a la mañana."),
    pm: WorkHoursRangeSchema.nullable().describe("Franja de la tarde; null si no atiende a la tarde."),
  })
  .openapi({ ref: "AvailableSlotsWorkHours" });

/** Día abierto: `slots` + `workHours` + `duration`. Día no abierto: `slots: []` + `message`. */
export const AvailableSlotsSchema = z
  .object({
    slots: z
      .array(AvailableSlotSchema)
      .describe("Grilla completa del día (libres y ocupados), en orden. Vacía si el día no está abierto."),
    message: z
      .string()
      .optional()
      .describe("Solo cuando el día no está abierto: por qué (no atiende ese día, sin horarios configurados, día bloqueado)."),
    workHours: AvailableSlotsWorkHoursSchema.optional().describe("Solo con día abierto."),
    duration: z.number().int().optional().describe("Solo con día abierto: duración en minutos usada para la grilla."),
  })
  .openapi({ ref: "AvailableSlots" });

export const UserHasScheduleSchema = z
  .object({
    hasSchedule: z.boolean().describe("true si al menos un día tiene alguna franja (AM o PM) cargada."),
  })
  .openapi({ ref: "UserHasSchedule" });

// ─── Llegada sin turno (walk-in) ─────────────────────────────────────────────

/** Registro completo de `WalkInArrival`. Está "en sala de espera" mientras `leftAt` y `assignedShiftId` sean null. */
export const WalkInArrivalSchema = z
  .object({
    id: z.string(),
    patientId: z.string().nullable().describe("Ficha del paciente si ya estaba cargado; null si es un desconocido."),
    firstName: z.string(),
    lastName: z.string(),
    telephone: z.string().nullable(),
    note: z.string().nullable().describe("Nota administrativa de recepción (motivo declarado). Nunca contenido clínico."),
    arrivedAt: IsoDateTime,
    leftAt: IsoDateTime.nullable().describe("Se retiró sin ser atendido; deja de figurar en la sala de espera."),
    assignedShiftId: z
      .string()
      .nullable()
      .describe("Turno que se le creó en el momento; con turno deja de figurar como espontáneo (pasa a la sala como turno)."),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "WalkInArrival" });

// ─── Exportación de datos del profesional (GET /api/user/export) ─────────────

export const UserExportProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    officeAddress: z.string().nullable(),
    bio: z.string().nullable(),
    licenseNumber: z.string().nullable(),
    specialization: z.object({ id: z.string(), name: z.string() }).nullable(),
    slotDurationMinutes: z.number().int(),
    bufferMinutes: z.number().int(),
    minAdvanceMinutes: z.number().int(),
    language: z.string(),
    timezone: z.string(),
    weekStart: z.number().int(),
    notifyReminder24h: z.boolean(),
    notifyReminder2h: z.boolean(),
    notifyNewShift: z.boolean(),
    notifyCancellation: z.boolean(),
    notifyWeeklySummary: z.boolean(),
    notifySmsFallback: z.boolean(),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "UserExportProfile" });

/** Fila `UserInsurance` con la obra social. */
export const UserExportInsuranceSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    healthInsuranceId: z.string(),
    copago: z.number().int(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    healthInsurance: HealthInsuranceRefSchema,
  })
  .openapi({ ref: "UserExportInsurance" });

/** Fila `PatientInsurance` completa (a diferencia de `PatientInsurance` del módulo de pacientes, trae `patientId` y `createdAt`). */
export const UserExportPatientInsuranceSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    healthInsuranceId: z.string(),
    affiliateNumber: z.string().nullable(),
    createdAt: IsoDateTime,
    healthInsurance: HealthInsuranceRefSchema,
  })
  .openapi({ ref: "UserExportPatientInsurance" });

export const UserExportPatientSchema = z
  .object({
    ...PatientSchema.shape,
    deletedAt: IsoDateTime.nullable().describe("Acá sí puede venir un paciente archivado: se exportan todos los que tuvieron turno con el profesional."),
    insurances: z.array(UserExportPatientInsuranceSchema).describe("Obras sociales adicionales."),
    clinicalRecord: ClinicalRecordSchema.nullable().describe(
      "Ficha clínica descifrada, solo si el actor es tratante del paciente (tiene algún asiento propio; el admin siempre); si no, null. Sin `evolutions` (van dentro de cada turno).",
    ),
  })
  .openapi({ ref: "UserExportPatient" });

export const UserExportShiftPatientSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    dni: z.string().nullable(),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
  })
  .openapi({ ref: "UserExportShiftPatient" });

/** Registro crudo de `Evolution` (sin las relaciones `user`/`shift` del módulo clínico). */
export const UserExportEvolutionSchema = z
  .object(EvolutionSchema.omit({ user: true, shift: true, clinicalRecord: true }).shape)
  .openapi({ ref: "UserExportEvolution" });

export const UserExportPrescriptionSchema = z
  .object(PrescriptionSchema.omit({ user: true, patient: true }).shape)
  .openapi({ ref: "UserExportPrescription" });

export const UserExportStudyOrderSchema = z
  .object(StudyOrderSchema.omit({ user: true, patient: true }).shape)
  .openapi({ ref: "UserExportStudyOrder" });

export const UserExportShiftSchema = z
  .object({
    ...ShiftSchema.omit({ patient: true, user: true, consultationType: true }).shape,
    patient: UserExportShiftPatientSchema,
    consultationType: z.object({ name: z.string() }).nullable(),
    evolution: UserExportEvolutionSchema.nullable().describe(
      "Solo si el actor puede verla (es el autor; el admin siempre); si no, null aunque exista.",
    ),
    prescriptions: z.array(UserExportPrescriptionSchema).describe("Solo las del actor (el admin todas)."),
    studyOrders: z.array(UserExportStudyOrderSchema).describe("Solo las del actor (el admin todas)."),
  })
  .openapi({ ref: "UserExportShift" });

/** Cuerpo de `GET /api/user/export` (sin envoltorio `success`). */
export const UserExportSchema = z
  .object({
    exportedAt: IsoDateTime,
    version: z.number().int().describe("Versión del formato de exportación; hoy 1."),
    profile: UserExportProfileSchema,
    preferences: z.array(UserPreferenceSchema).describe("Horarios de atención por día."),
    blockDays: z.array(BlockDaySchema).describe("Todos los días bloqueados, por fecha."),
    acceptedInsurances: z.array(UserExportInsuranceSchema),
    patients: z.array(UserExportPatientSchema).describe("Pacientes distintos con algún turno del profesional (incluidos archivados)."),
    shifts: z.array(UserExportShiftSchema).describe("Todos los turnos del profesional, más recientes primero."),
  })
  .openapi({ ref: "UserExport" });
