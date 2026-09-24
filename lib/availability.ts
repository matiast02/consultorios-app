// Huecos libres de la agenda de un profesional.
//
// Hora: todo se calcula en hora argentina (UTC-3 fijo; Argentina no tiene
// horario de verano desde 2009), sin depender del huso del servidor. Las
// preferencias ("09:00"–"12:00") son hora civil AR y `date` es la fecha civil
// AR "YYYY-MM-DD".
//
// BlockDay.date es una fecha civil: la API la guarda a medianoche UTC
// (`new Date("YYYY-MM-DD")`) y el seed a medianoche local del servidor
// (00:00Z o 03:00Z). En ambos casos la fecha UTC del valor guardado es la
// fecha civil bloqueada, así que se compara por esa fecha.
//
// Se usa desde la agenda interna (/api/users/[id]/available-slots) y desde la
// reserva online (lib/online-booking.ts), que además re-chequea el hueco
// dentro de su transacción pasando `db: tx`.

import { prisma } from "@/lib/prisma";

/** `prisma` o el `tx` de un $transaction interactivo. */
export type AvailabilityDb = Omit<typeof prisma, "$extends" | "$transaction" | "$connect" | "$disconnect" | "$on">;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const AR_OFFSET_MS = -3 * 60 * MINUTE_MS;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// ─── Fechas (hora AR) ────────────────────────────────────────────────────────

/** "YYYY-MM-DD" de un instante, en hora argentina. */
export function arDateKey(d: Date): string {
  return new Date(d.getTime() + AR_OFFSET_MS).toISOString().slice(0, 10);
}

/** "HH:MM" de un instante, en hora argentina. */
export function arTimeLabel(d: Date): string {
  return new Date(d.getTime() + AR_OFFSET_MS).toISOString().slice(11, 16);
}

/** true si es "YYYY-MM-DD" y una fecha real (rechaza 2026-02-31). */
export function isValidDateKey(key: unknown): key is string {
  if (typeof key !== "string" || !DATE_KEY_RE.test(key)) return false;
  const d = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

/** Instante de las 00:00 (hora AR) de una fecha civil. */
export function arDayStart(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - AR_OFFSET_MS);
}

export function addDaysToKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0=Domingo … 6=Sábado (mismo criterio que UserPreference.day). */
export function dayOfWeekOfKey(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

/** Medianoche UTC de la fecha civil (rango de búsqueda de BlockDay). */
function utcMidnight(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

// ─── Grilla de un día (puro) ─────────────────────────────────────────────────

export interface WorkHours {
  fromHourAM: string | null;
  toHourAM: string | null;
  fromHourPM: string | null;
  toHourPM: string | null;
}

function parseHHMM(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = HHMM_RE.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Tramos válidos [desde, hasta) en minutos desde las 00:00. */
function workSegments(h: WorkHours): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [from, to] of [
    [h.fromHourAM, h.toHourAM],
    [h.fromHourPM, h.toHourPM],
  ] as const) {
    const f = parseHHMM(from);
    const t = parseHHMM(to);
    if (f != null && t != null && f < t) out.push([f, t]);
  }
  return out;
}

export interface Busy {
  start: Date;
  end: Date;
}

export interface GridSlot {
  start: Date;
  end: Date;
  /** false si se superpone con un turno no cancelado (más el buffer). */
  available: boolean;
}

export interface BuildDaySlotsInput {
  date: string;
  hours: WorkHours;
  durationMinutes: number;
  /** Tiempo entre turnos: paso de la grilla = duración + buffer, y los turnos ocupan ± buffer. */
  bufferMinutes?: number;
  busy: Busy[];
  /** Los slots que empiezan en o antes de este instante se descartan. */
  notBefore?: Date | null;
}

export function buildDaySlots(input: BuildDaySlotsInput): GridSlot[] {
  const duration = input.durationMinutes;
  if (!Number.isInteger(duration) || duration < 1) return [];
  const buffer = Math.max(0, Math.floor(input.bufferMinutes ?? 0));
  const step = duration + buffer;
  const bufferMs = buffer * MINUTE_MS;
  const dayStart = arDayStart(input.date).getTime();
  const notBefore = input.notBefore?.getTime() ?? null;

  const slots: GridSlot[] = [];
  for (const [from, to] of workSegments(input.hours)) {
    for (let min = from; min + duration <= to; min += step) {
      const start = dayStart + min * MINUTE_MS;
      const end = start + duration * MINUTE_MS;
      if (notBefore != null && start <= notBefore) continue;
      const occupied = input.busy.some(
        (b) => b.start.getTime() - bufferMs < end && b.end.getTime() + bufferMs > start,
      );
      slots.push({ start: new Date(start), end: new Date(end), available: !occupied });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ─── Día con datos de la base ────────────────────────────────────────────────

export type DayStatus =
  | "OPEN" // atiende: `slots` tiene la grilla (libres y ocupados)
  | "NOT_WORKING" // sin UserPreference para ese día de la semana
  | "NO_HOURS" // hay preferencia pero ningún tramo válido
  | "BLOCKED"; // BlockDay del profesional

export interface DayAvailability {
  date: string;
  status: DayStatus;
  hours: WorkHours | null;
  slots: GridSlot[];
}

interface DayOptions {
  durationMinutes: number;
  bufferMinutes?: number;
  notBefore?: Date | null;
}

function pickHours(p: WorkHours): WorkHours {
  return { fromHourAM: p.fromHourAM, toHourAM: p.toHourAM, fromHourPM: p.fromHourPM, toHourPM: p.toHourPM };
}

function computeDay(
  date: string,
  pref: WorkHours | null | undefined,
  blocked: boolean,
  busy: Busy[],
  opts: DayOptions,
): DayAvailability {
  if (!pref) return { date, status: "NOT_WORKING", hours: null, slots: [] };
  const hours = pickHours(pref);
  if (workSegments(hours).length === 0) return { date, status: "NO_HOURS", hours, slots: [] };
  if (blocked) return { date, status: "BLOCKED", hours, slots: [] };
  return {
    date,
    status: "OPEN",
    hours,
    slots: buildDaySlots({
      date,
      hours,
      durationMinutes: opts.durationMinutes,
      bufferMinutes: opts.bufferMinutes,
      busy,
      notBefore: opts.notBefore,
    }),
  };
}

function busyWhere(medicId: string, from: Date, to: Date, bufferMinutes: number) {
  const bufferMs = Math.max(0, bufferMinutes) * MINUTE_MS;
  return {
    userId: medicId,
    status: { notIn: ["CANCELLED" as const] },
    start: { lt: new Date(to.getTime() + bufferMs) },
    end: { gt: new Date(from.getTime() - bufferMs) },
  };
}

/** Grilla de un día (libres y ocupados) de un profesional. */
export async function loadDayAvailability(
  opts: DayOptions & { medicId: string; date: string; db?: AvailabilityDb },
): Promise<DayAvailability> {
  const db = opts.db ?? prisma;
  const { medicId, date } = opts;

  const pref = await db.userPreference.findUnique({
    where: { userId_day: { userId: medicId, day: dayOfWeekOfKey(date) } },
  });
  if (!pref || workSegments(pref).length === 0) return computeDay(date, pref, false, [], opts);

  const nextDay = addDaysToKey(date, 1);
  const blocked = await db.blockDay.findFirst({
    where: { userId: medicId, date: { gte: utcMidnight(date), lt: utcMidnight(nextDay) } },
    select: { id: true },
  });
  if (blocked) return computeDay(date, pref, true, [], opts);

  const busy = await db.shift.findMany({
    where: busyWhere(medicId, arDayStart(date), arDayStart(nextDay), opts.bufferMinutes ?? 0),
    select: { start: true, end: true },
  });
  return computeDay(date, pref, false, busy, opts);
}

/** Grillas de `days` días consecutivos desde `from` (3 consultas en total). */
export async function loadRangeAvailability(
  opts: DayOptions & { medicId: string; from: string; days: number; db?: AvailabilityDb },
): Promise<DayAvailability[]> {
  const db = opts.db ?? prisma;
  const { medicId, from } = opts;
  const days = Math.max(0, Math.floor(opts.days));
  if (days === 0) return [];
  const keys = Array.from({ length: days }, (_, i) => addDaysToKey(from, i));
  const after = addDaysToKey(from, days);

  const [prefs, blocks, busy] = await Promise.all([
    db.userPreference.findMany({ where: { userId: medicId } }),
    db.blockDay.findMany({
      where: { userId: medicId, date: { gte: utcMidnight(from), lt: utcMidnight(after) } },
      select: { date: true },
    }),
    db.shift.findMany({
      where: busyWhere(medicId, arDayStart(from), arDayStart(after), opts.bufferMinutes ?? 0),
      select: { start: true, end: true },
    }),
  ]);

  const prefByDay = new Map(prefs.map((p) => [p.day, p]));
  const blockedKeys = new Set(blocks.map((b) => new Date(b.date).toISOString().slice(0, 10)));
  return keys.map((key) => computeDay(key, prefByDay.get(dayOfWeekOfKey(key)), blockedKeys.has(key), busy, opts));
}

// ─── API principal ───────────────────────────────────────────────────────────

export interface GetAvailableSlotsInput {
  medicId: string;
  /** Fecha civil AR "YYYY-MM-DD". */
  date: string;
  durationMinutes: number;
  now?: Date;
  /** Anticipación mínima adicional (p.ej. la de la reserva online); se usa la mayor entre esta y la del médico. */
  minAdvanceMinutes?: number;
  db?: AvailabilityDb;
}

/**
 * Huecos libres de un profesional en un día: respeta UserPreference del día,
 * BlockDay, turnos no cancelados (con `bufferMinutes` del médico),
 * `minAdvanceMinutes` del médico y nunca devuelve horarios pasados.
 */
export async function getAvailableSlots(input: GetAvailableSlotsInput): Promise<Array<{ start: Date; end: Date }>> {
  if (!isValidDateKey(input.date)) return [];
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();

  const medic = await db.user.findUnique({
    where: { id: input.medicId },
    select: { bufferMinutes: true, minAdvanceMinutes: true },
  });
  if (!medic) return [];

  const advance = Math.max(0, medic.minAdvanceMinutes ?? 0, input.minAdvanceMinutes ?? 0);
  const day = await loadDayAvailability({
    medicId: input.medicId,
    date: input.date,
    durationMinutes: input.durationMinutes,
    bufferMinutes: medic.bufferMinutes ?? 0,
    notBefore: new Date(now.getTime() + advance * MINUTE_MS),
    db,
  });
  return day.slots.filter((s) => s.available).map(({ start, end }) => ({ start, end }));
}
