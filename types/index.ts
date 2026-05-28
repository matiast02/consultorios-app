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
  // Emergency contact
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
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
  // Reception flow (secretary dashboard)
  arrivedAt?: string | null;
  consultationStartedAt?: string | null;
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

export type BlockDayCategory = "VACATION" | "HOLIDAY" | "CONFERENCE" | "OTHER";

export const BLOCK_DAY_CATEGORY_LABELS: Record<BlockDayCategory, string> = {
  VACATION: "Vacaciones",
  HOLIDAY: "Feriado",
  CONFERENCE: "Congreso",
  OTHER: "Otro",
};

export const BLOCK_DAY_CATEGORY_COLORS: Record<BlockDayCategory, string> = {
  VACATION: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  HOLIDAY: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  CONFERENCE: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  OTHER: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700",
};

export interface BlockDay {
  id: string;
  userId: string;
  date: string;
  category: BlockDayCategory;
  note?: string | null;
}

// ─── User Notification Preferences ───────────────────────────────────────────

export interface UserNotifications {
  notifyReminder24h: boolean;
  notifyReminder2h: boolean;
  notifyNewShift: boolean;
  notifyCancellation: boolean;
  notifyWeeklySummary: boolean;
  notifySmsFallback: boolean;
}

export type NotificationKey = keyof UserNotifications;

// ─── User Scheduling & Regional Config ───────────────────────────────────────

export interface UserPreferencesConfig {
  slotDurationMinutes: number;
  bufferMinutes: number;
  minAdvanceMinutes: number;
  language: string;
  timezone: string;
  weekStart: number;
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
  // Anthropometry
  heightCm?: number | null;
  weightKg?: number | string | null; // Prisma Decimal serializes as string
  // Habits
  habitsTobacco?: string | null;
  habitsAlcohol?: string | null;
  habitsActivity?: string | null;
  habitsDiet?: string | null;
  // Structured allergies (JSON string of StructuredAllergy[])
  structuredAllergies?: string | null;
  evolutions?: Evolution[];
  createdAt: string;
  updatedAt: string;
}

export type AllergySeverity = "alta" | "media" | "baja";

export interface StructuredAllergy {
  nombre: string;
  severidad: AllergySeverity;
  nota?: string | null;
}

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

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
  durationDays?: number;
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

// ─── Medic Dashboard ────────────────────────────────────────────────────────

export interface DashboardShift {
  id: string;
  start: string;
  end: string;
  status: ShiftStatus;
  observations?: string | null;
  isOverbook?: boolean;
  durationMinutes: number;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    telephone?: string | null;
    os?: { id: string; name: string; code?: string | null } | null;
  } | null;
  consultationType?: { id: string; name: string; color?: string | null } | null;
}

export interface DashboardTodayStats {
  total: number;
  atendidos: number;
  porVenir: number;
  confirmados: number;
  ausentes: number;
  pendientes: number;
}

export interface DashboardTodayData {
  date: string;
  shifts: DashboardShift[];
  nextShift: DashboardShift | null;
  stats: DashboardTodayStats;
}

export interface DashboardWeekDay {
  date: string;
  count: number;
  dayLabel: string;
  dayNumber: number;
  isToday: boolean;
}

export interface DashboardWeekData {
  totalShifts: number;
  weekStart: string;
  weekEnd: string;
  byDay: DashboardWeekDay[];
}

export interface DashboardPendienteItem {
  count: number;
  summary: string;
}

export interface DashboardPendientes {
  evolucionesSinCerrar: DashboardPendienteItem;
  recetasParaRenovar: DashboardPendienteItem;
  estudiosPendientes: DashboardPendienteItem;
}

export interface DashboardRecentPatient {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  lastShiftType: string | null;
  lastShiftTime: string;
}

export interface MedicDashboardData {
  today: DashboardTodayData;
  week: DashboardWeekData;
  pendientes: DashboardPendientes;
  recentPatients: DashboardRecentPatient[];
}

// ─── Secretary Dashboard ────────────────────────────────────────────────────

export type ReminderStatus = "PENDING" | "SENT" | "FAILED";

export interface SecretaryHeaderData {
  secretaryName: string;
  now: string; // ISO timestamp
  activeProfessionalsCount: number;
}

export interface SecretaryStatsData {
  enSalaDeEspera: number;
  enConsulta: number;
  esperandoMas15: number;
  huecosHoy: number;
}

export interface WaitingRoomItemPatient {
  id: string | null;
  firstName: string;
  lastName: string;
  telephone?: string | null;
  osShort?: string | null;
}

export interface WaitingRoomItemShift {
  id: string;
  start: string;
  durationMinutes: number;
  medicId: string;
  medicShortName: string;
  medicColor?: string | null;
  consultationTypeName?: string | null;
}

export interface WaitingRoomItem {
  id: string;
  kind: "scheduled" | "walkin";
  arrivedAt: string;
  minutesWaiting: number;
  isNext: boolean;
  note?: string | null;
  patient: WaitingRoomItemPatient;
  shift?: WaitingRoomItemShift | null;
}

export interface NextToCallData {
  waitingRoomId: string;
  kind: "scheduled" | "walkin";
  patient: { firstName: string; lastName: string };
  medicShortName: string;
  medicColor?: string | null;
  room?: string | null;
  shiftStart?: string | null;
  minutesWaiting: number;
}

export interface ReminderItem {
  id: string;
  shiftId: string;
  time: string; // HH:mm
  patientShortName: string;
  medicShortName: string;
  medicColor?: string | null;
  status: ReminderStatus;
}

export interface SecretaryRemindersData {
  context: "today" | "tomorrow";
  total: number;
  pending: number;
  sent: number;
  items: ReminderItem[];
}

export interface MedicSlotsGroup {
  medicId: string;
  medicShortName: string;
  dotColor?: string | null;
  count: number;
  slots: Array<{ time: string; durationMinutes: number }>;
}

export type AgendaAutoMode = "columns-detailed" | "columns-compact" | "rails";

export interface AgendaShiftMini {
  id: string;
  start: string;
  end: string;
  status: ShiftStatus;
  patientShortName: string;
  consultationTypeName?: string | null;
  isWalkIn?: boolean;
}

export interface AgendaProfessional {
  id: string;
  shortName: string;
  especialidad?: string | null;
  room?: string | null;
  dotColor?: string | null;
  isPinned: boolean;
  turnSegments: Array<"AM" | "PM">;
  hasWaitingPatients?: boolean;
  hasFreeSlots?: boolean;
  shifts: AgendaShiftMini[];
}

export interface SecretaryAgendaData {
  autoMode: AgendaAutoMode;
  profesionales: AgendaProfessional[];
  totalShifts: number;
}

export interface SecretaryDashboardData {
  header: SecretaryHeaderData;
  stats: SecretaryStatsData;
  salaDeEspera: WaitingRoomItem[];
  proximoALlamar: NextToCallData | null;
  recordatorios: SecretaryRemindersData;
  huecosHoy: MedicSlotsGroup[];
  agenda: SecretaryAgendaData;
}

export interface WalkInArrival {
  id: string;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  telephone?: string | null;
  note?: string | null;
  arrivedAt: string;
  leftAt?: string | null;
  assignedShiftId?: string | null;
}

export interface ShiftReminder {
  id: string;
  shiftId: string;
  scheduledFor: string;
  status: ReminderStatus;
  channel: string;
  sentAt?: string | null;
}

// ─── Admin Dashboard ────────────────────────────────────────────────────────

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW_SENSITIVE"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_BLOCKED"
  | "LOGOUT"
  | "PASSWORD_CHANGED";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "Creación",
  UPDATE: "Edición",
  DELETE: "Eliminación",
  VIEW_SENSITIVE: "Acceso a datos sensibles",
  LOGIN_SUCCESS: "Login",
  LOGIN_FAILED: "Login fallido",
  LOGIN_BLOCKED: "Login bloqueado",
  LOGOUT: "Cierre de sesión",
  PASSWORD_CHANGED: "Cambio de contraseña",
};

export type AuditSeverity = "info" | "warn" | "critical";

export interface AuditEvent {
  id: string;
  createdAt: string;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  action: AuditAction;
  resource: string;
  resourceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: string | null;
  severity: AuditSeverity;
}

export interface AdminHeader {
  adminName: string;
  now: string;
  totalUsers: number;
  totalPatients: number;
}

export interface AdminStatTodayShifts {
  value: number;
  deltaPctVsYesterday: number | null;
}

export interface AdminStatOccupancy {
  used: number;
  total: number;
  pct: number;
}

export interface AdminStatFailedLogins {
  value: number;
  blockedCount: number;
  deltaPctVs7dAvg: number | null;
}

export interface AdminStatNoShow {
  month: string; // YYYY-MM
  pct: number;
  absent: number;
  total: number;
  deltaPctVsPrevMonth: number | null;
}

export interface AdminStats {
  todayShifts: AdminStatTodayShifts;
  occupancyToday: AdminStatOccupancy;
  failedLogins24h: AdminStatFailedLogins;
  noShowRateMonth: AdminStatNoShow;
}

export interface CatalogPatientsIncomplete {
  missingDni: number;
  missingPhone: number;
  missingHealthInsurance: number;
  total: number;
}

export interface CatalogMedicWithoutPreferences {
  id: string;
  name: string;
}

export interface CatalogHealth {
  patientsIncomplete: CatalogPatientsIncomplete;
  medicsWithoutPreferences: {
    count: number;
    items: CatalogMedicWithoutPreferences[];
  };
  healthInsurancesUnused90d: { count: number };
  specializationsWithoutColor: { count: number };
  modules: { module: string; name: string; enabled: boolean }[];
}

export interface TrendWeekPoint {
  weekStart: string;
  label: string;
  count: number;
}

export interface TrendMonthPoint {
  month: string;
  label: string;
  total: number;
  cancelled: number;
  absent: number;
  noShowPct: number;
}

export interface TrendTopSpecialty {
  id: string | null;
  name: string;
  color: string | null;
  count: number;
}

export interface TrendTopInsurance {
  id: string | null;
  name: string;
  count: number;
}

export interface AdminTrends {
  shiftsByWeek: TrendWeekPoint[];
  cancellationByMonth: TrendMonthPoint[];
  topSpecialties: TrendTopSpecialty[];
  topHealthInsurances: TrendTopInsurance[];
}

export interface RecentLoginItem {
  userId: string;
  name: string;
  role: string | null;
  loggedAt: string;
  ipAddress: string | null;
}

export interface InactiveUserItem {
  id: string;
  name: string;
  lastLoginAt: string | null;
}

export interface UsersBreakdown {
  activeByRole: {
    medic: number;
    secretary: number;
    admin: number;
    inactive: number;
  };
  recentLogins: RecentLoginItem[];
  inactiveUsers30d: {
    count: number;
    items: InactiveUserItem[];
  };
}

export interface AdminDashboardData {
  header: AdminHeader;
  stats: AdminStats;
  activityFeed: AuditEvent[];
  catalogHealth: CatalogHealth;
  trends: AdminTrends;
  users: UsersBreakdown;
}

export interface AuditRecentResponse {
  items: AuditEvent[];
  nextCursor: string | null;
}
