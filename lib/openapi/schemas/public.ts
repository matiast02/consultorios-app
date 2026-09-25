// DTO compartidos de las rutas públicas (sin sesión) del registro OpenAPI:
// landing (info del consultorio, horarios por profesional, contacto), reserva
// online (/reservar, /reserva/<token>) y link de confirmación de turno (/turno/<token>).
//
// La forma es la que DEVUELVEN las rutas y lib/online-booking.ts. Principio de
// minimización: nada clínico y nunca datos del paciente registrado; las vistas
// por token solo repiten lo que cargó el propio solicitante.

import { z } from "zod";
import { onlineBookingStatusEnum, shiftStatusEnum } from "@/lib/validations";
import { ErrorSchema, IsoDate, IsoDateTime } from "../registry";
import { ClinicHoursDaySchema } from "./admin";
// `ReminderResponse` se define una sola vez, en el módulo de recordatorios.
import { ReminderResponseSchema } from "./reminders";

// ─── Landing ─────────────────────────────────────────────────────────────────

const SpecializationRefSchema = z
  .object({ id: z.string(), name: z.string(), color: z.string().nullable().describe("Hex, p. ej. #0EA5E9.") })
  .openapi({ ref: "PublicSpecializationRef" });

/** `ClinicSettings` sin la configuración interna de recordatorios ni la ventana de reservas online. */
export const PublicClinicSettingsSchema = z
  .object({
    id: z.string().describe('Siempre "default".'),
    name: z.string().nullable(),
    tagline: z.string().nullable(),
    contactEmail: z.string().nullable(),
    whatsappPrimary: z.string().nullable().describe("Solo dígitos (E.164 sin `+`)."),
    whatsappSecondary: z.string().nullable(),
    phoneDisplay: z.string().nullable(),
    prefillWhatsappMessage: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    mapLat: z.number().nullable(),
    mapLng: z.number().nullable(),
    mapZoom: z.number().int().nullable(),
    showTeam: z.boolean(),
    showHours: z.boolean(),
    showMap: z.boolean(),
    showContactForm: z.boolean(),
    yearsOfService: z.number().int().nullable(),
    patientsServedDisplay: z.string().nullable(),
    onlineBookingEnabled: z.boolean().describe("Único dato de reservas online que se expone; el resto lo da `/api/public/booking/config`."),
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "PublicClinicSettings" });

export const PublicMedicSchema = z
  .object({
    id: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    name: z.string(),
    image: z.string().nullable(),
    bio: z.string().nullable(),
    licenseNumber: z.string().nullable().describe("Matrícula profesional."),
    specialization: SpecializationRefSchema.nullable(),
  })
  .openapi({ ref: "PublicMedic" });

export const PublicSpecializationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    medicCount: z.number().int().min(1).describe("Profesionales activos; las especialidades sin profesionales no se listan."),
  })
  .openapi({ ref: "PublicSpecialization" });

export const ClinicInfoSchema = z
  .object({
    settings: PublicClinicSettingsSchema.nullable().describe("null si el consultorio nunca guardó su configuración."),
    hours: z.array(ClinicHoursDaySchema).describe("Horarios generales del consultorio (0 = lunes)."),
    medics: z.array(PublicMedicSchema).describe("Profesionales activos con rol medic, por apellido."),
    specializations: z.array(PublicSpecializationSchema),
    healthInsurances: z.array(z.object({ id: z.string(), name: z.string() })),
  })
  .openapi({ ref: "ClinicInfo" });

const TimeRangeSchema = z
  .object({ from: z.string().describe('"HH:mm"'), to: z.string().describe('"HH:mm"') })
  .openapi({ ref: "TimeRange" });

export const ClinicScheduleDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).describe("0 = lunes … 6 = domingo (convertido desde el domingo-inicio de las preferencias)."),
    am: TimeRangeSchema.nullable(),
    pm: TimeRangeSchema.nullable(),
  })
  .openapi({ ref: "ClinicScheduleDay" });

export const ClinicScheduleMedicSchema = z
  .object({
    id: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    name: z.string(),
    image: z.string().nullable(),
    licenseNumber: z.string().nullable(),
    specialization: SpecializationRefSchema.nullable(),
    days: z.array(ClinicScheduleDaySchema).length(7).describe("Siempre 7 días; sin atención → `am` y `pm` en null."),
  })
  .openapi({ ref: "ClinicScheduleMedic" });

export const ContactRequestCreatedSchema = z
  .object({
    id: z.string().nullable().describe("null cuando el envío fue descartado por el anti-bot (respuesta señuelo)."),
    whatsappLink: z
      .string()
      .nullable()
      .describe("Link `https://wa.me/<número>?text=…` con el mensaje prellenado; null si el consultorio no tiene WhatsApp configurado o fue señuelo."),
  })
  .openapi({ ref: "ContactRequestCreated" });

// ─── Reserva online ──────────────────────────────────────────────────────────

export const PublicBookingMedicSchema = z
  .object({
    id: z.string(),
    shortName: z.string().describe('"Dr. Pérez" / "Dra. Gómez".'),
    slotDurationMinutes: z.number().int().describe("Duración por defecto del turno si no se elige tipo de consulta."),
  })
  .openapi({ ref: "PublicBookingMedic" });

export const PublicBookingSpecialtySchema = z
  .object({
    id: z.string().describe('ID de la especialidad, o "sin-especialidad" para el grupo "Otros profesionales" (siempre último).'),
    name: z.string(),
    color: z.string().nullable(),
    medics: z.array(PublicBookingMedicSchema),
  })
  .openapi({ ref: "PublicBookingSpecialty" });

export const PublicBookingConfigSchema = z
  .object({
    enabled: z.boolean().describe("Módulo habilitado. Con false, `consultationTypes` y `specialties` vienen vacíos."),
    clinicName: z.string().nullable(),
    notes: z.string().nullable().describe("Aviso configurado por el consultorio para el paciente."),
    minAdvanceHours: z.number().int().describe("Anticipación mínima general (cada profesional puede exigir más)."),
    maxDaysAhead: z.number().int().describe("Hasta cuántos días adelante se puede reservar."),
    consultationTypes: z.array(z.object({ id: z.string(), name: z.string(), durationMinutes: z.number().int() })),
    specialties: z
      .array(PublicBookingSpecialtySchema)
      .describe("Solo profesionales activos que aceptan reservas online y tienen al menos un día de atención configurado."),
  })
  .openapi({ ref: "PublicBookingConfig" });

export const PublicAvailabilitySlotSchema = z
  .object({
    start: IsoDateTime.describe("Inicio exacto del hueco; es lo que se manda en `start` al reservar."),
    time: z.string().describe('"HH:mm" en hora de Argentina, para mostrar.'),
  })
  .openapi({ ref: "PublicAvailabilitySlot" });

export const PublicAvailabilityDaySchema = z
  .object({
    date: IsoDate,
    closed: z.boolean().describe("true si no atiende, está bloqueado o queda fuera de la ventana de reserva; entonces `slots` es vacío."),
    slots: z.array(PublicAvailabilitySlotSchema).describe("Solo huecos libres, nunca información de otros turnos."),
  })
  .openapi({ ref: "PublicAvailabilityDay" });

export const PublicAvailabilitySchema = z
  .object({
    medicId: z.string(),
    durationMinutes: z.number().int().describe("Duración usada para calcular los huecos (del tipo de consulta o la del profesional)."),
    days: z.array(PublicAvailabilityDaySchema),
  })
  .openapi({ ref: "PublicAvailability" });

export const PublicBookingCreatedSchema = z
  .object({
    requestId: z.string(),
    status: z.literal("PENDING_CONFIRMATION"),
    start: IsoDateTime,
    medicShortName: z.string(),
    manageUrl: z.string().describe("Path relativo `/reserva/<token>` para ver o cancelar la reserva; el token no se vuelve a mostrar."),
    emailSent: z.boolean().describe("Se envió el email con el link (solo si cargó email y hay proveedor configurado)."),
    message: z.string().describe("Texto para mostrar al paciente."),
  })
  .openapi({ ref: "PublicBookingCreated" });

export const PublicBookingViewSchema = z
  .object({
    status: onlineBookingStatusEnum.describe(
      "Estado efectivo: PENDING_CONFIRMATION, CONFIRMED, CANCELLED o EXPIRED (pendiente cuyo turno ya empezó).",
    ),
    clinicName: z.string().nullable(),
    address: z.string().nullable(),
    patientFirstName: z.string().describe("Primer nombre tal como lo cargó el solicitante (nunca del paciente registrado)."),
    start: IsoDateTime,
    medicShortName: z.string(),
    consultationTypeName: z.string().nullable(),
    canCancel: z.boolean().describe("Pendiente o confirmada, turno activo y a futuro."),
  })
  .openapi({ ref: "PublicBookingView" });

/** 409 de POST /api/public/booking/{token}: error estándar + la vista actual en `data`. */
export const PublicBookingConflictSchema = ErrorSchema.extend({ data: PublicBookingViewSchema }).openapi({
  ref: "PublicBookingConflict",
});

// ─── Link de confirmación de turno ───────────────────────────────────────────

export const PublicShiftConfirmationSchema = z
  .object({
    clinicName: z.string().nullable(),
    patientFirstName: z.string().describe("Solo el primer nombre."),
    start: IsoDateTime,
    medicShortName: z.string(),
    address: z.string().nullable(),
    status: shiftStatusEnum.describe("Estado actual del turno."),
    canRespond: z.boolean().describe("Turno PENDING o CONFIRMED y a futuro: se puede confirmar o cancelar."),
    response: ReminderResponseSchema.nullable().describe(
      "Respuesta del paciente por este link o, si no la hay, la última dada desde otro recordatorio del mismo turno.",
    ),
  })
  .openapi({ ref: "PublicShiftConfirmation" });

/** 409 de POST /api/public/turno/{token}: error estándar (sin `code`) + la vista actual en `data`. */
export const PublicShiftConflictSchema = ErrorSchema.extend({ data: PublicShiftConfirmationSchema }).openapi({
  ref: "PublicShiftConflict",
});
