// ─── Shift Status ────────────────────────────────────────────────────────────

export type ShiftStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ABSENT"
  | "FINISHED"
  | "CANCELLED";

// Etiquetas y colores: una sola paleta en lib/shift-status.ts (nombres históricos).
export {
  SHIFT_STATUS_LABEL as SHIFT_STATUS_LABELS,
  SHIFT_STATUS_BADGE_OUTLINE as SHIFT_STATUS_COLORS,
  SHIFT_STATUS_DOT as SHIFT_STATUS_DOT_COLORS,
} from "@/lib/shift-status";

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
  // Consentimiento informado (Ley 25.326)
  consentType?: "WRITTEN" | "VERBAL_RECORDED" | "DIGITAL_SIGNATURE" | null;
  consentGivenAt?: string | null;
  consentNote?: string | null;
  // Oposición a recordatorios de turnos (contracts/api-schemas/reminders.yaml)
  reminderOptOut?: boolean;
  reminderOptOutAt?: string | null;
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
  // Cobertura con la que se atiende (obra social aceptada por el profesional, o particular).
  // Ambos vacíos en turnos anteriores a esta versión: la UI muestra la obra social del paciente.
  coverageInsuranceId?: string | null;
  isPrivate?: boolean;
  coverageInsurance?: HealthInsurance | null;
  // Confirmación y origen
  confirmedAt?: string | null;
  confirmedVia?: "PATIENT_LINK" | "STAFF" | "PHONE" | null;
  source?: "STAFF" | "ONLINE";
  /** Solo en `GET /api/shifts/{id}`: número de sala abierto (módulo waiting_room), o null. */
  ticket?: WaitingTicketOpen | null;
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
  annulledAt?: string | null;
  annulReason?: string | null;
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
  color?: string | null;
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
  acceptsOnlineBooking: boolean;
  /** Solo el propio profesional (y el admin) modifican horarios y días bloqueados. */
  agendaLocked: boolean;
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
  // Profession-specific visual editors (JSON strings)
  odontogram?: string | null;
  genogram?: string | null;
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
  annulledAt?: string | null;
  annulReason?: string | null;
  user?: { name?: string | null; firstName?: string | null; lastName?: string | null };
  shift?: { id?: string; start: string; end: string } | null;
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
  annulledAt?: string | null;
  annulReason?: string | null;
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
  /** Sala de espera: llegada registrada y pase a consulta (ISO). */
  arrivedAt?: string | null;
  consultationStartedAt?: string | null;
  /** Minutos en sala (llegó y todavía no pasó a consulta); null en otro caso. */
  minutesWaiting?: number | null;
  /** Número de sala del día (módulo waiting_room); null sin módulo o sin número. */
  ticketNumber?: number | null;
  /** Cobertura del turno: obra social aceptada por el médico, o particular. Ausentes en turnos viejos. */
  coverage?: { id: string; name: string } | null;
  isPrivate?: boolean;
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
  /** Solicitudes de acceso a la HC que el médico puede decidir (tratante). */
  solicitudesDeAcceso: DashboardPendienteItem & {
    /** Paciente de la solicitud más antigua (link a su ficha); null si no hay. */
    patientId: string | null;
  };
}

export interface DashboardRecentPatient {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  lastShiftType: string | null;
  lastShiftTime: string;
}

export interface MedicWaitingRoomInfo {
  /** Módulo «Sala de espera y llamado» activo: el médico puede llamar desde «Turnos de hoy». */
  enabled: boolean;
  /** Consultorio habitual del médico (prellena el llamado). */
  room: string | null;
}

export interface MedicDashboardData {
  today: DashboardTodayData;
  week: DashboardWeekData;
  pendientes: DashboardPendientes;
  recentPatients: DashboardRecentPatient[];
  waitingRoom: MedicWaitingRoomInfo;
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
  /** Consultorio habitual del profesional (prellena el llamado). */
  room?: string | null;
}

export interface WaitingRoomItem {
  id: string;
  kind: "scheduled" | "walkin";
  arrivedAt: string;
  minutesWaiting: number;
  isNext: boolean;
  /** Número de sala del día (módulo waiting_room); null con el módulo apagado. */
  ticketNumber?: number | null;
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
  /** Número de sala del día (módulo waiting_room); null con el módulo apagado. */
  ticketNumber?: number | null;
}

export type ReminderChannel = "EMAIL" | "WHATSAPP" | "SMS";
export type ReminderResponse = "CONFIRMED" | "CANCELLED";

export interface ReminderItem {
  id: string;
  shiftId: string;
  time: string; // HH:mm
  patientShortName: string;
  medicShortName: string;
  medicColor?: string | null;
  status: ReminderStatus;
  channel?: ReminderChannel;
  offsetHours?: number;
  /** WhatsApp click-to-chat: lo envía recepción y lo marca como enviado. */
  manual?: boolean;
  /** Link wa.me con el mensaje prellenado (solo canal WHATSAPP con teléfono). */
  waLink?: string | null;
  deliveredTo?: string | null;
  response?: ReminderResponse | null;
  respondedAt?: string | null;
  errorMessage?: string | null;
}

export interface ReminderSettings {
  remindersEnabled: boolean;
  reminderHoursBefore: number;
  reminderSecondHoursBefore: number | null;
  reminderChannels: ReminderChannel[];
  reminderTemplate: string | null;
}

export interface ReminderDispatchSummary {
  planned: number;
  sentEmail: number;
  manualPending: number;
  failed: number;
  skippedOptOut: number;
  skippedNoContact: number;
}

// ─── Adjuntos de la historia clínica ─────────────────────────────────────────

export type AttachmentEntityType = "EVOLUTION" | "STUDY_ORDER" | "CLINICAL_RECORD";

export const ATTACHMENT_ENTITY_LABELS: Record<AttachmentEntityType, string> = {
  EVOLUTION: "Evolución",
  STUDY_ORDER: "Orden de estudio",
  CLINICAL_RECORD: "Ficha clínica",
};

export interface ClinicalAttachment {
  id: string;
  patientId: string;
  entityType: AttachmentEntityType;
  entityId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  description: string | null;
  uploadedBy: { id: string; shortName: string };
  canAnnul: boolean;
  annulledAt: string | null;
  annulReason: string | null;
  createdAt: string;
  inlinePreviewable: boolean;
  /** Solo imágenes decodificadas correctamente: GET /api/attachments/{id}/thumbnail. */
  hasThumbnail: boolean;
  /** Dimensiones de la imagen original (null en PDF). */
  width: number | null;
  height: number | null;
}

// ─── Reservas online ─────────────────────────────────────────────────────────

export type OnlineBookingStatus = "PENDING_CONFIRMATION" | "CONFIRMED" | "CANCELLED" | "EXPIRED";

export const ONLINE_BOOKING_STATUS_LABELS: Record<OnlineBookingStatus, string> = {
  PENDING_CONFIRMATION: "Pendiente de confirmar",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  EXPIRED: "Vencida",
};

export interface OnlineBookingSettings {
  onlineBookingEnabled: boolean;
  onlineBookingMinAdvanceHours: number;
  onlineBookingMaxDaysAhead: number;
  onlineBookingNotes: string | null;
}

export interface PublicBookingMedic {
  id: string;
  shortName: string;
  slotDurationMinutes: number;
}

export interface PublicBookingSpecialty {
  id: string;
  name: string;
  color: string | null;
  medics: PublicBookingMedic[];
}

export interface PublicBookingConfig {
  enabled: boolean;
  clinicName: string | null;
  notes: string | null;
  minAdvanceHours: number;
  maxDaysAhead: number;
  consultationTypes: Array<{ id: string; name: string; durationMinutes: number }>;
  specialties: PublicBookingSpecialty[];
}

export interface PublicAvailabilityDay {
  date: string; // YYYY-MM-DD
  closed: boolean;
  slots: Array<{ start: string; time: string }>;
}

export interface PublicBookingCreateInput {
  medicId: string;
  start: string;
  consultationTypeId?: string | null;
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  email?: string | null;
  healthInsurance?: string | null;
  privacyAccepted: boolean;
  _hp?: string;
  _elapsedMs?: number;
}

export interface PublicBookingCreated {
  requestId: string;
  status: "PENDING_CONFIRMATION";
  start: string;
  medicShortName: string;
  manageUrl: string;
  emailSent: boolean;
  message: string;
}

export interface PublicBookingView {
  status: OnlineBookingStatus;
  clinicName: string | null;
  address: string | null;
  patientFirstName: string;
  start: string;
  medicShortName: string;
  consultationTypeName: string | null;
  canCancel: boolean;
}

export interface OnlineBookingStaffItem {
  id: string;
  shiftId: string;
  status: OnlineBookingStatus;
  createdAt: string;
  start: string;
  medicShortName: string;
  medicColor: string | null;
  consultationTypeName: string | null;
  requester: {
    firstName: string;
    lastName: string;
    dni: string;
    phone: string;
    email: string | null;
    healthInsuranceText: string | null;
  };
  patientId: string;
  matchedExisting: boolean;
  patientDataMismatch: boolean;
}

/** Vista pública mínima del turno para el link de confirmación (sin datos clínicos). */
export interface PublicShiftConfirmation {
  clinicName: string | null;
  patientFirstName: string;
  start: string;
  medicShortName: string;
  address: string | null;
  status: ShiftStatus;
  canRespond: boolean;
  response: ReminderResponse | null;
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

export interface SecretaryOnlineBookingsData {
  pending: number;
  items: OnlineBookingStaffItem[]; // las más antiguas primero, máx. 5
}

/** Paciente en consulta (ya llamado), para la pestaña «En consulta» de recepción. */
export interface CalledItem {
  shiftId: string;
  patient: { id: string | null; firstName: string; lastName: string };
  medicId: string;
  medicShortName: string;
  medicColor?: string | null;
  /** Consultorio del llamado (ticket) o el habitual del profesional. */
  room: string | null;
  /** Último llamado (ISO). */
  calledAt: string;
  minutesSinceCall: number;
  ticketNumber: number | null;
  /** Cantidad de llamados; 0 si no tiene número. */
  callCount: number;
}

export interface SecretaryWaitingRoomInfo {
  /** Módulo «Sala de espera y llamado» (waiting_room) activo: hay números de sala. */
  enabled: boolean;
}

export interface SecretaryDashboardData {
  header: SecretaryHeaderData;
  stats: SecretaryStatsData;
  salaDeEspera: WaitingRoomItem[];
  proximoALlamar: NextToCallData | null;
  recordatorios: SecretaryRemindersData;
  huecosHoy: MedicSlotsGroup[];
  agenda: SecretaryAgendaData;
  /** Pacientes en consulta (llamados) hoy, el último llamado primero. */
  llamados: CalledItem[];
  waitingRoom: SecretaryWaitingRoomInfo;
  reservasOnline?: SecretaryOnlineBookingsData;
}

/** Número de sala (módulo waiting_room). Ver docs/SALA-DE-ESPERA.md. */
export interface WaitingTicketSummary {
  id: string;
  number: number;
  /** YYYY-MM-DD en el día del consultorio. */
  date: string;
}

/** Ticket abierto del turno (`GET /api/shifts/{id}`): llamado o todavía en sala. */
export interface WaitingTicketOpen extends WaitingTicketSummary {
  room: string | null;
  calledAt: string | null;
  lastCalledAt: string | null;
  callCount: number;
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
  /** Copias de HC PENDING y, de ellas, las vencidas (dueAt < ahora; Ley 26.529 art. 14). */
  hcCopiesPending: { count: number; overdue: number };
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

// ─── Clinic public site ───────────────────────────────────────────────────────

export interface ClinicSettings {
  id: string;
  name: string | null;
  tagline: string | null;
  contactEmail: string | null;
  whatsappPrimary: string | null;
  whatsappSecondary: string | null;
  phoneDisplay: string | null;
  prefillWhatsappMessage: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  mapLat: number | null;
  mapLng: number | null;
  mapZoom: number | null;
  showTeam: boolean;
  showHours: boolean;
  showMap: boolean;
  showContactForm: boolean;
  yearsOfService: number | null;
  patientsServedDisplay: string | null;
}

export interface ClinicHoursDay {
  id: string;
  dayOfWeek: number; // 0=Lun..6=Dom (Monday-start)
  closed: boolean;
  amOpen: string | null;
  amClose: string | null;
  pmOpen: string | null;
  pmClose: string | null;
}

export interface PublicMedic {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  image: string | null;
  bio: string | null;
  licenseNumber: string | null;
  specialization: { id: string; name: string; color: string | null } | null;
}

export interface PublicSpecialization {
  id: string;
  name: string;
  color: string | null;
  medicCount: number;
}

export interface ClinicContactRequest {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  healthInsurance: string | null;
  specializationId: string | null;
  specialization: { id: string; name: string } | null;
  preferredDay: string | null;
  message: string | null;
  status: "new" | "read" | "archived";
  whatsappOpened: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface ClinicInfoResponse {
  settings: ClinicSettings | null;
  hours: ClinicHoursDay[];
  medics: PublicMedic[];
  specializations: PublicSpecialization[];
  healthInsurances: { id: string; name: string }[];
}

// ─── Concesiones de acceso a la HC ──────────────────────────────────────────
// Contrato: contracts/api-schemas/clinical-access-grants.yaml

export type ClinicalGrantStatus = "PENDING" | "ACTIVE" | "REJECTED" | "REVOKED" | "EXPIRED";
export type ClinicalGrantScope = "FULL" | "PARTIAL";
export type ClinicalConsentType = "WRITTEN" | "VERBAL_RECORDED" | "DIGITAL_SIGNATURE";

export interface ClinicalGrantUserRef {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ClinicalAccessGrant {
  id: string;
  patientId: string;
  patient?: { id: string; firstName: string; lastName: string };
  grantedToUserId: string;
  grantedTo?: ClinicalGrantUserRef;
  requestedById: string;
  decidedById: string | null;
  decidedBy: ClinicalGrantUserRef | null;
  revokedById: string | null;
  revokedBy: ClinicalGrantUserRef | null;
  /** Estado efectivo: una ACTIVE vencida llega como EXPIRED. */
  status: ClinicalGrantStatus;
  isActive: boolean;
  scope: ClinicalGrantScope;
  sections: string[];
  entryIds: string[];
  reason: string;
  consentType: ClinicalConsentType | null;
  consentEvidence: string | null;
  consentAt: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: { approve: boolean; reject: boolean; revoke: boolean; cancel: boolean };
}

export interface ClinicalAccessStatus {
  isAdmin: boolean;
  /** Tratante (asientos propios con el paciente) o admin: puede editar la ficha. */
  hasRelationship: boolean;
  canDecide: boolean;
  canRequest: boolean;
  record: { full: boolean; sections: string[] };
  activeGrant: {
    id: string;
    scope: ClinicalGrantScope;
    sections: string[];
    entryIds: string[];
    startsAt: string;
    expiresAt: string;
  } | null;
  pendingRequest: {
    id: string;
    scope: ClinicalGrantScope;
    sections: string[];
    createdAt: string;
  } | null;
  pendingToDecide: number;
}
