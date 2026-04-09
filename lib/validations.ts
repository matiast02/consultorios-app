import { z } from "zod";

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
});

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

export const addBlockDaysSchema = z.object({
  userId: z.string().min(1),
  dates: z
    .array(z.string().min(1, "Fecha inválida"))
    .min(1, "Debe incluir al menos una fecha"),
});

export const removeBlockDaySchema = z.object({
  id: z.string().min(1),
});

// ─── Clinical Record ─────────────────────────────────────────────────────────

const bloodTypeEnum = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

export const updateClinicalRecordSchema = z.object({
  bloodType: bloodTypeEnum.nullable().optional(),
  allergies: z.string().nullable().optional(),
  personalHistory: z.string().nullable().optional(),
  familyHistory: z.string().nullable().optional(),
  currentMedication: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.string().nullable().optional(), // JSON: profession-specific fields
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
  specializationId: z.string().nullable().optional(),
  role: z.enum(["medic", "secretary", "admin"]).optional(),
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

export const createSpecializationSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  professionConfigId: z.string().nullable().optional(),
});

export const updateSpecializationSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  professionConfigId: z.string().nullable().optional(),
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
