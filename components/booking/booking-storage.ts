// Progreso del asistente de /reservar en sessionStorage (se borra al cerrar la
// pestaña). Nunca localStorage: los datos personales no sobreviven a la sesión.
// Al terminar la reserva se borra el borrador y solo queda el resumen con el
// link de gestión, para no perderlo si el paciente recarga la página.

import {
  EMPTY_BOOKING_PATIENT,
  isIsoDate,
  isPast,
  type BookingPatientValues,
} from "@/lib/booking-client";
import type { PublicBookingCreated } from "@/types";

export type WizardStep = 1 | 2 | 3 | 4;

export interface SelectedSlot {
  date: string; // YYYY-MM-DD
  start: string; // ISO
  time: string; // HH:mm (hora AR)
}

export interface BookingDraft {
  v: 1;
  /** Cuándo se abrió el asistente (para `_elapsedMs`), aunque se recargue la página. */
  startedAt: number;
  step: WizardStep;
  medicId: string | null;
  consultationTypeId: string | null;
  weekFrom: string | null;
  slot: SelectedSlot | null;
  patient: BookingPatientValues;
}

export interface BookingDone {
  v: 1;
  created: PublicBookingCreated;
  clinicName: string | null;
  notes: string | null;
  specialtyName: string | null;
  consultationTypeName: string | null;
}

const DRAFT_KEY = "reservar:borrador";
const DONE_KEY = "reservar:enviada";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = store()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage lleno o bloqueado: el asistente sigue funcionando en memoria
  }
}

function remove(key: string) {
  try {
    store()?.removeItem(key);
  } catch {
    // idem
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const idOrNull = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);

function sanitizePatient(raw: unknown): BookingPatientValues {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ...EMPTY_BOOKING_PATIENT,
    firstName: str(p.firstName, 100),
    lastName: str(p.lastName, 100),
    dni: str(p.dni, 10).replace(/\D/g, ""),
    phone: str(p.phone, 30),
    email: str(p.email, 254),
    healthInsurance: str(p.healthInsurance, 80),
    privacyAccepted: p.privacyAccepted === true,
  };
}

function sanitizeSlot(raw: unknown): SelectedSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!isIsoDate(s.date) || typeof s.start !== "string" || typeof s.time !== "string") return null;
  if (isPast(s.start)) return null;
  return { date: s.date, start: s.start, time: s.time.slice(0, 5) };
}

export function readDraft(): BookingDraft | null {
  const raw = readJson(DRAFT_KEY);
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.v !== 1) return null;
  const step = d.step === 1 || d.step === 2 || d.step === 3 || d.step === 4 ? d.step : 1;
  return {
    v: 1,
    startedAt: typeof d.startedAt === "number" && Number.isFinite(d.startedAt) ? d.startedAt : Date.now(),
    step,
    medicId: idOrNull(d.medicId),
    consultationTypeId: idOrNull(d.consultationTypeId),
    weekFrom: isIsoDate(d.weekFrom) ? d.weekFrom : null,
    slot: sanitizeSlot(d.slot),
    patient: sanitizePatient(d.patient),
  };
}

export function writeDraft(draft: BookingDraft) {
  writeJson(DRAFT_KEY, draft);
}

export function clearDraft() {
  remove(DRAFT_KEY);
}

export function readDone(): BookingDone | null {
  const raw = readJson(DONE_KEY);
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<BookingDone>;
  if (d.v !== 1 || !d.created || typeof d.created.start !== "string") return null;
  // Un turno que ya pasó no tiene sentido seguir mostrándolo.
  if (isPast(d.created.start)) {
    remove(DONE_KEY);
    return null;
  }
  return d as BookingDone;
}

export function writeDone(done: BookingDone) {
  writeJson(DONE_KEY, done);
}

export function clearDone() {
  remove(DONE_KEY);
}
