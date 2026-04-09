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
  _count?: { users: number };
}

// ─── User / Medic ────────────────────────────────────────────────────────────

export interface Medic {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  specialization?: { id: string; name: string } | null;
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
