import { z } from "zod";
import {
  CONSENT_TYPES,
  GRANT_MAX_DAYS,
  GRANT_SCOPES,
  GRANT_SECTIONS,
  GRANT_STATUSES,
} from "@/lib/clinical-grants-shared";

// ─── Patients ─────────────────────────────────────────────────────────────────

export const createPatientSchema = z.object({
  firstName: z.string().min(1, "El nombre es obligatorio").max(100),
  lastName: z.string().min(1, "El apellido es obligatorio").max(100),
  birthDate: z.string().min(1, "La fecha de nacimiento es obligatoria"),
  sex: z.enum(["M", "F", "X"], { required_error: "El sexo es obligatorio" }),
  dni: z.string().max(20).nullable().optional(),
  email: z.string().email("Email inválido").nullable().optional(),
  telephone: z.string().max(30).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  province: z.string().max(100).nullable().optional(),
  osId: z.string().nullable().optional(),
  osNumber: z.string().max(50).nullable().optional(),
  emergencyContactName: z.string().max(120).nullable().optional(),
  emergencyContactPhone: z.string().max(40).nullable().optional(),
  // Consentimiento informado para el tratamiento de datos de salud (Ley 25.326 art. 5-6)
  consentType: z.enum(["WRITTEN", "VERBAL_RECORDED", "DIGITAL_SIGNATURE"]).nullable().optional(),
  consentGivenAt: z.string().nullable().optional(), // ISO date
  consentNote: z.string().max(500).nullable().optional(),
  // Oposición a recibir recordatorios de turnos (Ley 25.326 art. 27)
  reminderOptOut: z.boolean().optional(),
});

export const CONSENT_TYPE_LABELS: Record<"WRITTEN" | "VERBAL_RECORDED" | "DIGITAL_SIGNATURE", string> = {
  WRITTEN: "Escrito (firmado)",
  VERBAL_RECORDED: "Verbal, registrado por el profesional",
  DIGITAL_SIGNATURE: "Firma digital",
};

export const updatePatientSchema = createPatientSchema.partial();

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const shiftStatusEnum = z.enum([
  "PENDING",
  "CONFIRMED",
  "ABSENT",
  "FINISHED",
  "CANCELLED",
]);

export const createShiftSchema = z.object({
  userId: z.string().min(1, "El médico es obligatorio"),
  patientId: z.string().min(1, "El paciente es obligatorio"),
  start: z.string().min(1, "La fecha de inicio es obligatoria"),
  end: z.string().min(1, "La fecha de fin es obligatoria"),
  observations: z.string().nullable().optional(),
  status: shiftStatusEnum.optional().default("PENDING"),
  isOverbook: z.boolean().optional().default(false),
  consultationTypeId: z.string().nullable().optional(),
});

export const updateShiftSchema = z.object({
  status: shiftStatusEnum.optional(),
  observations: z.string().nullable().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  patientId: z.string().optional(),
  userId: z.string().optional(),
});

// ─── Health Insurance ─────────────────────────────────────────────────────────

export const createHealthInsuranceSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  code: z.string().max(20).nullable().optional(),
});

// ─── Preferences ──────────────────────────────────────────────────────────────

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timeString = z
  .string()
  .regex(timeRegex, "Formato de hora inválido (HH:mm)")
  .nullable()
  .optional();

export const dayPreferenceSchema = z.object({
  day: z.number().int().min(0).max(6),
  fromHourAM: timeString,
  toHourAM: timeString,
  fromHourPM: timeString,
  toHourPM: timeString,
});

export const upsertPreferencesSchema = z.object({
  userId: z.string().min(1),
  preferences: z.array(dayPreferenceSchema).min(1),
});

// ─── Block Days ───────────────────────────────────────────────────────────────

export const blockDayCategoryEnum = z.enum(["VACATION", "HOLIDAY", "CONFERENCE", "OTHER"]);

export const addBlockDaysSchema = z.object({
  userId: z.string().min(1),
  dates: z
    .array(z.string().min(1, "Fecha inválida"))
    .min(1, "Debe incluir al menos una fecha"),
  category: blockDayCategoryEnum.optional().default("OTHER"),
  note: z.string().max(500).nullable().optional(),
});

export const removeBlockDaySchema = z.object({
  id: z.string().min(1),
});

// ─── Clinical Record ─────────────────────────────────────────────────────────

const bloodTypeEnum = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

export const allergySeverityEnum = z.enum(["alta", "media", "baja"]);

export const structuredAllergySchema = z.object({
  nombre: z.string().min(1).max(80),
  severidad: allergySeverityEnum,
  nota: z.string().max(240).nullable().optional(),
});

export const updateClinicalRecordSchema = z.object({
  bloodType: bloodTypeEnum.or(z.literal("")).nullable().optional(),
  allergies: z.string().nullable().optional(),
  personalHistory: z.string().nullable().optional(),
  familyHistory: z.string().nullable().optional(),
  currentMedication: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.string().nullable().optional(), // JSON: profession-specific fields
  // Anthropometry
  heightCm: z.number().int().min(30).max(260).nullable().optional(),
  weightKg: z.number().min(1).max(400).nullable().optional(),
  // Habits
  habitsTobacco: z.string().max(240).nullable().optional(),
  habitsAlcohol: z.string().max(240).nullable().optional(),
  habitsActivity: z.string().max(240).nullable().optional(),
  habitsDiet: z.string().max(240).nullable().optional(),
  // Structured allergies (array; serialized to JSON server-side)
  structuredAllergies: z.array(structuredAllergySchema).nullable().optional(),
  // Profession-specific visual editors (JSON strings)
  odontogram: z.string().nullable().optional(),
  genogram: z.string().nullable().optional(),
});

export const createEvolutionSchema = z.object({
  shiftId: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  physicalExam: z.string().nullable().optional(),
  diagnosis: z.string().nullable().optional(),
  diagnosisCode: z.string().max(20).nullable().optional(),
  treatment: z.string().nullable().optional(),
  indications: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateEvolutionSchema = createEvolutionSchema.partial();

// ─── Query Params ─────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const shiftsQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  userId: z.string().min(1).optional(),
  status: shiftStatusEnum.optional(),
  patientId: z.string().min(1).optional(),
});

export const statsQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  userId: z.string().min(1).optional(),
});

export const blockDaysQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  from: z.string().min(1, "Parámetro 'from' requerido"),
  to: z.string().min(1, "Parámetro 'to' requerido"),
});

export const availabilityQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

// ─── Health Insurance (update) ───────────────────────────────────────────────

export const updateHealthInsuranceSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  code: z.string().max(20).nullable().optional(),
});

// ─── Users (admin) ───────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio").max(100),
  email: z.string().email("Email inválido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  specializationId: z.string().nullable().optional(),
  role: z.enum(["medic", "secretary", "admin"]).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  licenseNumber: z.string().max(50).nullable().optional(),
  specializationId: z.string().nullable().optional(),
  role: z.enum(["medic", "secretary", "admin"]).optional(),
  isActive: z.boolean().optional(),
});

// ─── Consultation Types ─────────────────────────────────────────────────────

export const createConsultationTypeSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  durationMinutes: z.number().int().min(5).max(120),
  color: z.string().nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});

export const updateConsultationTypeSchema = createConsultationTypeSchema.partial();

// ─── Specializations ─────────────────────────────────────────────────────────

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .nullable()
  .optional();

export const createSpecializationSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  professionConfigId: z.string().nullable().optional(),
  color: hexColorSchema,
});

export const updateSpecializationSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  professionConfigId: z.string().nullable().optional(),
  color: hexColorSchema,
});

// ─── Profession Configs ─────────────────────────────────────────────────────

export const createProfessionConfigSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  professionalLabel: z.string().min(1).max(20),
  patientLabel: z.string().min(1).max(50).default("Paciente"),
  prescriptionLabel: z.string().min(1).max(50),
  evolutionLabel: z.string().min(1).max(50),
  clinicalRecordLabel: z.string().min(1).max(50),
  enabledModules: z.array(z.string()).default([]),
  clinicalFields: z.array(z.string()).default([]),
});

export const updateProfessionConfigSchema = createProfessionConfigSchema.partial();

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().min(1).optional(),
  resource: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ─── Password / Auth ─────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().email("Email invalido"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token requerido"),
  password: z.string()
    .min(8, "Minimo 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayuscula")
    .regex(/[0-9]/, "Debe contener al menos un numero"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Contrasena actual requerida"),
  newPassword: z.string()
    .min(8, "Minimo 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayuscula")
    .regex(/[0-9]/, "Debe contener al menos un numero"),
});

// ─── Prescriptions ───────────────────────────────────────────────────────────

export const prescriptionItemSchema = z.object({
  medication: z.string().min(1, "Medicamento requerido"),
  dose: z.string().min(1, "Dosis requerida"),
  frequency: z.string().min(1, "Frecuencia requerida"),
  duration: z.string().min(1, "Duracion requerida"),
  notes: z.string().optional(),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().min(1),
  shiftId: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, "Agregar al menos un medicamento"),
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
});

export const createMedicationSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(200),
  genericName: z.string().max(200).optional(),
  presentation: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
});

// ─── Study Orders ───────────────────────────────────────────────────────────

export const studyOrderItemSchema = z.object({
  type: z.enum(["laboratorio", "imagen", "interconsulta", "otro"]),
  description: z.string().min(1, "La descripcion es obligatoria"),
  urgency: z.enum(["normal", "urgente"]).default("normal"),
  notes: z.string().optional(),
});

export const createStudyOrderSchema = z.object({
  userId: z.string().min(1),
  patientId: z.string().min(1),
  shiftId: z.string().optional(),
  items: z.array(studyOrderItemSchema).min(1, "Agregar al menos un estudio"),
});

export const updateStudyOrderSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).optional(),
  resultNotes: z.string().nullable().optional(),
});

// ─── Meal Plans ─────────────────────────────────────────────────────────────

export const mealSectionSchema = z.object({
  name: z.string().min(1),
  time: z.string().optional(),
  options: z.string(),
});

export const createMealPlanSchema = z.object({
  userId: z.string().min(1),
  patientId: z.string().min(1),
  shiftId: z.string().optional(),
  title: z.string().min(1, "El titulo es obligatorio"),
  targetCalories: z.number().int().min(500).max(6000).nullable().optional(),
  proteinPct: z.number().int().min(0).max(100).nullable().optional(),
  carbsPct: z.number().int().min(0).max(100).nullable().optional(),
  fatPct: z.number().int().min(0).max(100).nullable().optional(),
  hydration: z.string().nullable().optional(),
  meals: z.array(mealSectionSchema).min(1, "Agregar al menos una comida"),
  avoidFoods: z.string().nullable().optional(),
  supplements: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateMealPlanSchema = createMealPlanSchema.partial();

// ─── Recurring Shifts ────────────────────────────────────────────────────────

export const createRecurringShiftsSchema = z.object({
  userId: z.string().min(1, "El médico es obligatorio"),
  patientId: z.string().min(1, "El paciente es obligatorio"),
  startDate: z.string().min(1, "La fecha de inicio es obligatoria"), // YYYY-MM-DD
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:mm)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:mm)"),
  frequencyWeeks: z.number().int().min(1).max(4),
  count: z.number().int().min(2).max(12),
  consultationTypeId: z.string().nullable().optional(),
});

// ─── Profile (self) ──────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  officeAddress: z.string().max(200).nullable().optional(),
  bio: z.string().max(280, "Máximo 280 caracteres").nullable().optional(),
  licenseNumber: z.string().max(50).nullable().optional(),
  specializationId: z.string().nullable().optional(),
});

// ─── User Preferences Config (scheduling + regional) ─────────────────────────

export const updatePreferencesConfigSchema = z.object({
  slotDurationMinutes: z.number().int().min(5).max(240).optional(),
  bufferMinutes: z.number().int().min(0).max(60).optional(),
  minAdvanceMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
  language: z.string().min(2).max(10).optional(),
  timezone: z.string().min(2).max(60).optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
  // Aparece en la reserva online pública (/reservar)
  acceptsOnlineBooking: z.boolean().optional(),
});

// ─── User Notification Preferences ───────────────────────────────────────────

export const updateNotificationsSchema = z.object({
  notifyReminder24h: z.boolean().optional(),
  notifyReminder2h: z.boolean().optional(),
  notifyNewShift: z.boolean().optional(),
  notifyCancellation: z.boolean().optional(),
  notifyWeeklySummary: z.boolean().optional(),
  notifySmsFallback: z.boolean().optional(),
});

// ─── User Insurances (with copago) ───────────────────────────────────────────

export const updateUserInsurancesSchema = z.object({
  insurances: z
    .array(
      z.object({
        insuranceId: z.string().min(1),
        copago: z.number().int().min(0).max(10_000_000).default(0),
      })
    )
    .optional(),
  // Backward-compat: aceptar la forma vieja {insuranceIds: string[]}
  insuranceIds: z.array(z.string().min(1)).optional(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type CreateHealthInsuranceInput = z.infer<typeof createHealthInsuranceSchema>;
export type UpsertPreferencesInput = z.infer<typeof upsertPreferencesSchema>;
export type AddBlockDaysInput = z.infer<typeof addBlockDaysSchema>;
export type UpdateClinicalRecordInput = z.infer<typeof updateClinicalRecordSchema>;
export type CreateEvolutionInput = z.infer<typeof createEvolutionSchema>;
export type UpdateEvolutionInput = z.infer<typeof updateEvolutionSchema>;
export type UpdateHealthInsuranceInput = z.infer<typeof updateHealthInsuranceSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateSpecializationInput = z.infer<typeof createSpecializationSchema>;
export type UpdateSpecializationInput = z.infer<typeof updateSpecializationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;
export type CreateRecurringShiftsInput = z.infer<typeof createRecurringShiftsSchema>;
export type CreateConsultationTypeInput = z.infer<typeof createConsultationTypeSchema>;
export type UpdateConsultationTypeInput = z.infer<typeof updateConsultationTypeSchema>;
export type CreateProfessionConfigInput = z.infer<typeof createProfessionConfigSchema>;
export type UpdateProfessionConfigInput = z.infer<typeof updateProfessionConfigSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesConfigInput = z.infer<typeof updatePreferencesConfigSchema>;
export type UpdateNotificationsInput = z.infer<typeof updateNotificationsSchema>;
export type UpdateUserInsurancesInput = z.infer<typeof updateUserInsurancesSchema>;

// ─── Clinic public site ───────────────────────────────────────────────────────

const PHONE_DIGITS_RE = /^[0-9]{10,15}$/;
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const reminderChannelEnum = z.enum(["EMAIL", "WHATSAPP", "SMS"]);

export const clinicSettingsSchema = z.object({
  name: z.string().max(80, "Máx. 80 caracteres").nullable().optional(),
  tagline: z.string().max(80).nullable().optional(),
  contactEmail: z.union([z.string().email("Email inválido"), z.literal(""), z.null()]).optional(),
  whatsappPrimary: z
    .union([z.string().regex(PHONE_DIGITS_RE, "Solo dígitos, 10-15 (E.164 sin +)"), z.literal(""), z.null()])
    .optional(),
  whatsappSecondary: z
    .union([z.string().regex(PHONE_DIGITS_RE, "Solo dígitos, 10-15"), z.literal(""), z.null()])
    .optional(),
  phoneDisplay: z.string().max(40).nullable().optional(),
  prefillWhatsappMessage: z.string().max(500, "Máx. 500 caracteres").nullable().optional(),
  addressLine1: z.string().max(160).nullable().optional(),
  addressLine2: z.string().max(160).nullable().optional(),
  mapLat: z.number().min(-90).max(90).nullable().optional(),
  mapLng: z.number().min(-180).max(180).nullable().optional(),
  mapZoom: z.number().int().min(1).max(20).nullable().optional(),
  showTeam: z.boolean().optional(),
  showHours: z.boolean().optional(),
  showMap: z.boolean().optional(),
  showContactForm: z.boolean().optional(),
  yearsOfService: z.number().int().min(0).max(200).nullable().optional(),
  patientsServedDisplay: z.string().max(40).nullable().optional(),
  // Recordatorios de turnos
  remindersEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1, "Mín. 1 hora").max(168, "Máx. 168 horas (7 días)").optional(),
  reminderSecondHoursBefore: z
    .number()
    .int()
    .min(1, "Mín. 1 hora")
    .max(48, "Máx. 48 horas")
    .nullable()
    .optional(),
  reminderChannels: z.array(reminderChannelEnum).max(3).optional(),
  reminderTemplate: z.string().max(1000, "Máx. 1000 caracteres").nullable().optional(),
  // Reservas online (sin .refine(): el PUT lee los campos presentes con .shape)
  onlineBookingEnabled: z.boolean().optional(),
  onlineBookingMinAdvanceHours: z
    .number()
    .int()
    .min(0, "Mín. 0 horas")
    .max(168, "Máx. 168 horas (7 días)")
    .optional(),
  onlineBookingMaxDaysAhead: z.number().int().min(1, "Mín. 1 día").max(180, "Máx. 180 días").optional(),
  onlineBookingNotes: z.string().max(500, "Máx. 500 caracteres").nullable().optional(),
});

// Acciones de recepción sobre un recordatorio (PATCH /api/shifts/reminders/[id])
export const reminderActionSchema = z.object({
  action: z.enum(["mark_sent", "mark_failed", "retry"]),
  note: z.string().trim().max(200).optional(),
});

// Respuesta del paciente desde el link público (/api/public/turno/[token])
export const publicShiftActionSchema = z.object({
  action: z.enum(["confirm", "cancel", "opt_out"]),
});

export const clinicHoursDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    closed: z.boolean(),
    amOpen: z.string().regex(TIME_HHMM_RE, "HH:mm").nullable().optional(),
    amClose: z.string().regex(TIME_HHMM_RE, "HH:mm").nullable().optional(),
    pmOpen: z.string().regex(TIME_HHMM_RE, "HH:mm").nullable().optional(),
    pmClose: z.string().regex(TIME_HHMM_RE, "HH:mm").nullable().optional(),
  })
  .refine((d) => d.closed || !!d.amOpen || !!d.pmOpen, {
    message: "Si no está cerrado, definí al menos un horario",
    path: ["closed"],
  })
  .refine((d) => !d.amOpen || !d.amClose || d.amOpen < d.amClose, {
    message: "El cierre AM debe ser posterior a la apertura",
    path: ["amClose"],
  })
  .refine((d) => !d.pmOpen || !d.pmClose || d.pmOpen < d.pmClose, {
    message: "El cierre PM debe ser posterior a la apertura",
    path: ["pmClose"],
  });

export const clinicHoursWeekSchema = z.array(clinicHoursDaySchema).length(7);

export const contactRequestSchema = z.object({
  fullName: z.string().min(2, "Ingresá tu nombre").max(120),
  phone: z.string().min(6, "Teléfono requerido").max(40),
  email: z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
  healthInsurance: z.string().max(80).optional().or(z.literal("")),
  specializationId: z.union([z.string().cuid(), z.literal("")]).optional(),
  preferredDay: z
    .union([
      z.enum(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]),
      z.literal(""),
    ])
    .optional(),
  message: z.string().max(1000).optional().or(z.literal("")),
  // Aceptación explícita del aviso de privacidad (Ley 25.326 art. 5-6; Disp. DNPDP 10/2008)
  privacyAccepted: z
    .boolean()
    .refine((v) => v === true, { message: "Tenés que aceptar la política de privacidad para enviar la solicitud" }),
});

export type ClinicSettingsInput = z.infer<typeof clinicSettingsSchema>;
export type ClinicHoursDayInput = z.infer<typeof clinicHoursDaySchema>;
export type ClinicHoursWeekInput = z.infer<typeof clinicHoursWeekSchema>;
export type ContactRequestInput = z.infer<typeof contactRequestSchema>;

// ─── Copia de la historia clínica (Ley 26.529 arts. 14 y 19) ─────────────────

export const hcCopyRequesterTypeEnum = z.enum([
  "PATIENT",
  "LEGAL_REPRESENTATIVE",
  "HEIR",
  "EXTERNAL_PROFESSIONAL",
  "JUDICIAL",
]);

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const createHcCopyRequestSchema = z
  .object({
    requesterType: hcCopyRequesterTypeEnum,
    requesterName: z.string().trim().min(2, "Ingresá el nombre del solicitante").max(120),
    requesterDni: optionalTrimmed(20),
    authorizationNote: optionalTrimmed(1000),
    reason: optionalTrimmed(1000),
  })
  .superRefine((d, ctx) => {
    // Art. 19: si no lo pide el propio paciente, hay que dejar constancia de
    // cómo se acreditó el vínculo o la autorización.
    if (d.requesterType !== "PATIENT" && !d.authorizationNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorizationNote"],
        message: "Indicá cómo se acreditó el vínculo o la autorización",
      });
    }
  });

export const deliverHcCopySchema = z.object({
  deliveryNote: optionalTrimmed(500),
});

export const hcCopyRequestsQuerySchema = z.object({
  status: z.enum(["PENDING", "DELIVERED", "CANCELLED"]).default("PENDING"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateHcCopyRequestInput = z.infer<typeof createHcCopyRequestSchema>;
export type DeliverHcCopyInput = z.infer<typeof deliverHcCopySchema>;

// ─── Concesiones de acceso a la HC (ClinicalAccessGrant) ─────────────────────

export const createAccessGrantSchema = z
  .object({
    patientId: z.string().min(1, "Paciente requerido").max(64),
    scope: z.enum(GRANT_SCOPES),
    sections: z.array(z.enum(GRANT_SECTIONS)).max(GRANT_SECTIONS.length).optional(),
    entryIds: z.array(z.string().min(1).max(64)).max(100).optional(),
    reason: z
      .string()
      .trim()
      .min(10, "Contá brevemente el motivo (mínimo 10 caracteres)")
      .max(1000, "Máximo 1000 caracteres"),
  })
  .refine(
    (d) => d.scope === "FULL" || (d.sections?.length ?? 0) + (d.entryIds?.length ?? 0) > 0,
    { message: "Elegí al menos una sección", path: ["sections"] },
  );

export const accessGrantActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    consentType: z.enum(CONSENT_TYPES, {
      errorMap: () => ({ message: "Indicá cómo se obtuvo el consentimiento del paciente" }),
    }),
    consentEvidence: z.string().trim().max(2000).nullable().optional(),
    // Cuándo se obtuvo el consentimiento: no puede ser futuro (5 min de tolerancia).
    consentAt: z.coerce
      .date()
      .refine((d) => d.getTime() <= Date.now() + 5 * 60 * 1000, {
        message: "La fecha del consentimiento no puede ser futura",
      })
      .optional(),
    days: z.number().int().min(1).max(GRANT_MAX_DAYS, `Máximo ${GRANT_MAX_DAYS} días`).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    decisionNote: z.string().trim().min(3, "Indicá el motivo del rechazo").max(1000),
  }),
  z.object({
    action: z.literal("revoke"),
    decisionNote: z.string().trim().max(1000).optional(),
  }),
  z.object({ action: z.literal("cancel") }),
]);

export const accessGrantsQuerySchema = z.object({
  patientId: z.string().min(1).max(64).optional(),
  status: z.enum(GRANT_STATUSES).optional(),
  box: z.enum(["received", "to-decide"]).optional(),
});

export type CreateAccessGrantInput = z.infer<typeof createAccessGrantSchema>;
export type AccessGrantActionInput = z.infer<typeof accessGrantActionSchema>;

// ─── Reservas online (contracts/api-schemas/online-booking.yaml) ─────────────

export const ONLINE_BOOKING_STATUSES = ["PENDING_CONFIRMATION", "CONFIRMED", "CANCELLED", "EXPIRED"] as const;
export const onlineBookingStatusEnum = z.enum(ONLINE_BOOKING_STATUSES);

const BOOKING_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BOOKING_PHONE_RE = /^[0-9+()\-\s.]+$/;

const bookingPersonName = (label: string) =>
  z
    .string({ required_error: `Ingresá tu ${label}` })
    .trim()
    .min(2, `Ingresá tu ${label}`)
    .max(100, "Máx. 100 caracteres")
    .transform((v) => v.replace(/\s+/g, " "));

// POST /api/public/booking. Minimización: sin motivo de consulta ni texto libre
// clínico. `_hp` / `_elapsedMs` (anti-bot) los lee la ruta antes de validar.
export const publicBookingCreateSchema = z.object({
  medicId: z.string({ required_error: "Elegí un profesional" }).trim().min(1, "Elegí un profesional").max(64),
  start: z.string({ required_error: "Elegí un horario" }).datetime({ offset: true, message: "Horario inválido" }),
  consultationTypeId: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .optional()
    .transform((v) => v || null),
  firstName: bookingPersonName("nombre"),
  lastName: bookingPersonName("apellido"),
  dni: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[.\s-]/g, "") : v),
    z
      .string({ required_error: "Ingresá tu DNI" })
      .regex(/^[0-9]{6,10}$/, "Ingresá tu DNI sin puntos (6 a 10 números)"),
  ),
  phone: z
    .string({ required_error: "Ingresá un celular" })
    .trim()
    .max(30, "Máx. 30 caracteres")
    .refine((v) => BOOKING_PHONE_RE.test(v) && v.replace(/\D/g, "").length >= 8, {
      message: "Ingresá un celular con código de área (ej.: 11 5555-5555)",
    }),
  email: z
    .union([z.string().trim().toLowerCase().email("Revisá el email").max(191), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  healthInsurance: z
    .union([z.string().trim().max(80, "Máx. 80 caracteres"), z.null()])
    .optional()
    .transform((v) => v || null),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: "Para reservar necesitamos que aceptes el uso de tus datos" }),
  }),
});

export const publicBookingAvailabilityQuerySchema = z.object({
  medicId: z.string().trim().min(1, "medicId es obligatorio").max(64),
  from: z.string().regex(BOOKING_DATE_RE, "Fecha inválida (YYYY-MM-DD)").optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
  consultationTypeId: z.string().trim().min(1).max(64).optional(),
});

// POST /api/public/booking/[token]
export const publicBookingActionSchema = z.object({
  action: z.enum(["cancel"]),
});

// GET /api/online-bookings?status=
export const onlineBookingsQuerySchema = z.object({
  status: onlineBookingStatusEnum.optional(),
});

// PATCH /api/online-bookings/[id]
export const onlineBookingStaffActionSchema = z.object({
  action: z.enum(["confirm", "reject"]),
});

export type PublicBookingCreateParsed = z.infer<typeof publicBookingCreateSchema>;
export type PublicBookingAvailabilityQuery = z.infer<typeof publicBookingAvailabilityQuerySchema>;

// ─── Adjuntos de la historia clínica ─────────────────────────────────────────
// entityType: el contrato usa minúsculas (evolution | study_order |
// clinical_record); se aceptan ambas formas y se normaliza al enum de Prisma
// (MAYÚSCULAS), que es lo que devuelven las respuestas.

export const ATTACHMENT_ENTITY_TYPES = ["EVOLUTION", "STUDY_ORDER", "CLINICAL_RECORD"] as const;

const attachmentEntityTypeSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
  z.enum(ATTACHMENT_ENTITY_TYPES, {
    errorMap: () => ({ message: "Tipo de asociación inválido (evolution, study_order o clinical_record)" }),
  }),
);

/** "" / null / ausente → undefined (los campos de multipart llegan como string o null). */
const blankToUndefined = (v: unknown) =>
  v == null || (typeof v === "string" && v.trim() === "") ? undefined : v;

const attachmentEntityIdSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(64).optional(),
);

/** Campos de texto del multipart de POST /api/patients/[id]/attachments (el archivo va aparte). */
export const uploadAttachmentFieldsSchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: attachmentEntityIdSchema,
  description: z.preprocess(
    blankToUndefined,
    z.string().trim().max(300, "La descripción admite hasta 300 caracteres").optional(),
  ),
});

/** GET /api/patients/[id]/attachments?entityType=&entityId= */
export const attachmentsQuerySchema = z.object({
  entityType: z.preprocess(blankToUndefined, attachmentEntityTypeSchema.optional()),
  entityId: attachmentEntityIdSchema,
});

/** DELETE /api/attachments/[id] — anulación lógica (motivo obligatorio). */
export const annulAttachmentSchema = z.object({
  reason: z
    .string({ required_error: "Indicá el motivo de la anulación" })
    .trim()
    .min(3, "Indicá el motivo de la anulación (mínimo 3 caracteres)")
    .max(300, "El motivo admite hasta 300 caracteres"),
});

export type UploadAttachmentFields = z.infer<typeof uploadAttachmentFieldsSchema>;
export type AttachmentsQuery = z.infer<typeof attachmentsQuerySchema>;
