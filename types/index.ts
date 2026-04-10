// ─── Shift Status ────────────────────────────────────────────────────────────

export type ShiftStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ABSENT"
  | "FINISHED"
  | "CANCELLED";

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  ABSENT: "Ausente",
  FINISHED: "Finalizado",
  CANCELLED: "Cancelado",
};

export const SHIFT_STATUS_COLORS: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  CONFIRMED: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800",
  ABSENT: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  FINISHED: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700",
};

export const SHIFT_STATUS_DOT_COLORS: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-500",
  CONFIRMED: "bg-cyan-500",
  ABSENT: "bg-red-500",
  FINISHED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
};

// ─── Health Insurance ────────────────────────────────────────────────────────

export interface HealthInsurance {
  id: string;
  name: string;
  code?: string | null;
}

// ─── Patient ─────────────────────────────────────────────────────────────────

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  sex?: string | null;
  dni?: string | null;
  email?: string | null;
  telephone?: string | null;
  address?: string | null;
  country?: string | null;
  province?: string | null;
  osId?: string | null;
  osNumber?: string | null;
  os?: HealthInsurance | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Shift ───────────────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  userId: string;
  patientId: string;
  start: string;
  end: string;
  observations?: string | null;
  status: ShiftStatus;
  isOverbook?: boolean;
  consultationTypeId?: string | null;
  consultationType?: ConsultationType | null;
  recurrenceGroupId?: string | null;
  patient?: Patient;
  user?: {
    id: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  rescheduledFrom?: string | null;
  rescheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Consultation Type ──────────────────────────────────────────────────────

export interface ConsultationType {
  id: string;
  name: string;
  durationMinutes: number;
  color?: string | null;
  isDefault: boolean;
}

// ─── Study Order ────────────────────────────────────────────────────────────

export type StudyOrderStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface StudyOrderItem {
  type: "laboratorio" | "imagen" | "interconsulta" | "otro";
  description: string;
  urgency: "normal" | "urgente";
  notes?: string;
}

export interface StudyOrder {
  id: string;
  userId: string;
  patientId: string;
  shiftId?: string | null;
  items: string; // JSON string of StudyOrderItem[]
  status: StudyOrderStatus;
  resultNotes?: string | null;
  patient?: Patient;
  user?: {
    id: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export const STUDY_ORDER_STATUS_LABELS: Record<StudyOrderStatus, string> = {
  PENDING: "Pendiente",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export const STUDY_ORDER_STATUS_COLORS: Record<StudyOrderStatus, string> = {
  PENDING: "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  COMPLETED: "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  CANCELLED: "border-slate-400 text-slate-500 bg-slate-50 dark:bg-slate-800/40",
};

export const STUDY_TYPE_LABELS: Record<StudyOrderItem["type"], string> = {
  laboratorio: "Laboratorio",
  imagen: "Imagen",
  interconsulta: "Interconsulta",
  otro: "Otro",
};

// ─── Notification ───────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  resourceId?: string | null;
  read: boolean;
  createdAt: string;
}

// ─── Profession Config ───────────────────────────────────────────────────────

export interface ProfessionConfig {
  id: string;
  code: string;
  name: string;
  professionalLabel: string;
  patientLabel: string;
  prescriptionLabel: string;
  evolutionLabel: string;
  clinicalRecordLabel: string;
  enabledModules: string; // JSON
  clinicalFields: string; // JSON
}

// ─── Meal Plan ──────────────────────────────────────────────────────────────

export interface MealSection {
  name: string; // "Desayuno", "Media mañana", "Almuerzo", etc.
  time?: string; // "07:30 - 08:30"
  options: string; // Free text with food options and portions
}

export interface MealPlan {
  id: string;
  userId: string;
  patientId: string;
  shiftId?: string | null;
  title: string;
  targetCalories?: number | null;
  proteinPct?: number | null;
  carbsPct?: number | null;
  fatPct?: number | null;
  hydration?: string | null;
  meals: string; // JSON MealSection[]
  avoidFoods?: string | null;
  supplements?: string | null;
  notes?: string | null;
  user?: {
    id: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export const MEAL_PLAN_TYPES = [
  "Plan hipocalórico",
  "Plan normocalórico",
  "Plan hipercalórico",
  "Plan cetogénico",
  "Plan vegetariano",
  "Plan sin TACC",
  "Plan para diabetes",
  "Plan personalizado",
];

export const DEFAULT_MEAL_SECTIONS: MealSection[] = [
  { name: "Desayuno", time: "07:30 - 08:30", options: "" },
  { name: "Media mañana", time: "10:30 - 11:00", options: "" },
  { name: "Almuerzo", time: "12:30 - 13:30", options: "" },
  { name: "Merienda", time: "16:00 - 17:00", options: "" },
  { name: "Media tarde", time: "18:00 - 18:30", options: "" },
  { name: "Cena", time: "20:30 - 21:30", options: "" },
];

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalPatients: number;
  todayShifts: number;
  pendingShifts: number;
  finishedShifts: number;
  confirmedShifts: number;
  absentShifts: number;
  cancelledShifts: number;
}

export interface StatsData {
  dashboard: DashboardStats;
  shiftsByMonth: { month: string; count: number }[];
  shiftsByStatus: { status: ShiftStatus; count: number }[];
  patientsByInsurance: { name: string; count: number }[];
}

// ─── Specialization ──────────────────────────────────────────────────────────

export interface Specialization {
  id: string;
  name: string;
  professionConfigId?: string | null;
  professionConfig?: ProfessionConfig | null;
  _count?: { users: number };
}

// ─── User / Medic ────────────────────────────────────────────────────────────

export interface Medic {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  specialization?: {
    id: string;
    name: string;
    professionConfig?: { name: string } | null;
  } | null;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface UserPreference {
  id: string;
  userId: string;
  day: number;
  fromHourAM?: string | null;
  toHourAM?: string | null;
  fromHourPM?: string | null;
  toHourPM?: string | null;
}

export interface BlockDay {
  id: string;
  userId: string;
  date: string;
}

// ─── Days of week ────────────────────────────────────────────────────────────

export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

// ─── Clinical Record ────────────────────────────────────────────────────────

export interface ClinicalRecord {
  id: string;
  patientId: string;
  bloodType?: string | null;
  allergies?: string | null;
  personalHistory?: string | null;
  familyHistory?: string | null;
  currentMedication?: string | null;
  notes?: string | null;
  customFields?: string | null; // JSON: profession-specific fields
  evolutions?: Evolution[];
  createdAt: string;
  updatedAt: string;
}

export interface Evolution {
  id: string;
  clinicalRecordId: string;
  shiftId?: string | null;
  userId: string;
  reason?: string | null;
  physicalExam?: string | null;
  diagnosis?: string | null;
  diagnosisCode?: string | null;
  treatment?: string | null;
  indications?: string | null;
  notes?: string | null;
  user?: { name?: string | null; firstName?: string | null; lastName?: string | null };
  shift?: { start: string; end: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

// ─── Prescriptions ──────────────────────────────────────────────────────────

export interface Prescription {
  id: string;
  patientId: string;
  userId: string;
  shiftId?: string | null;
  items: string; // JSON string of PrescriptionItem[]
  diagnosis?: string | null;
  notes?: string | null;
  user?: { name?: string | null; firstName?: string | null; lastName?: string | null };
  patient?: Patient;
  createdAt: string;
}

export interface PrescriptionItem {
  medication: string;
  dose: string;
  frequency: string;
  duration: string;
  notes?: string;
}

export interface MedicationOption {
  id: string;
  name: string;
  genericName?: string | null;
  presentation?: string | null;
  category?: string | null;
}

// ─── Modules ────────────────────────────────────────────────────────────────

export interface ModuleConfig {
  id: string;
  module: string;
  name: string;
  enabled: boolean;
}
