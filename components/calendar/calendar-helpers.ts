import type { Shift, UserPreference } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

export const HOURS_START = 7;
export const HOURS_END = 21;
export const HOUR_SLOTS = Array.from(
  { length: HOURS_END - HOURS_START },
  (_, i) => HOURS_START + i
);

/** Pixel height per hour row used by the day timeline. */
export const DAY_HOUR_PX = 64;
/** Pixel height per hour row used by the week timeline. */
export const WEEK_HOUR_PX = 32;
/** How many days into the future the agenda view shows. */
export const AGENDA_DAYS = 14;

// ─── Utility Functions ────────────────────────────────────────────────────────

export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Get Monday of the week containing `date` */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Get Sunday (week start = Sunday) of the week containing `date`. */
export function getSunday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Capitalise the first character of `s`. */
export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function toMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ─── State token system ──────────────────────────────────────────────────────
//
// Match the design's per-state palette using only Tailwind utility classes.
// We expose one record per "slot" of the UI:
//   bar      → left coloured stripe (3–4 px)
//   pill     → coloured pill background+border for month/week events
//   chip     → filter chip dot color + text token
//   timeline → background + left-border for the day-view event card
//   badge    → state badge inside drawer / agenda row
//   dot      → small dot (for legend / day-list)
//
// The values are class strings so React can compose them; we keep arbitrary
// values to nail the exact hex from the design CSS instead of approximating.

export type CalState = "pendiente" | "confirmado" | "ausente" | "finalizado" | "cancelado" | "sobreturno";

/** Map ShiftStatus + isOverbook to the design's "state" token. */
export function shiftToState(shift: Shift): CalState {
  if (shift.isOverbook && (shift.status === "PENDING" || shift.status === "CONFIRMED"))
    return "sobreturno";
  switch (shift.status) {
    case "PENDING":   return "pendiente";
    case "CONFIRMED": return "confirmado";
    case "ABSENT":    return "ausente";
    case "FINISHED":  return "finalizado";
    case "CANCELLED": return "cancelado";
  }
}

export const STATE_LABEL: Record<CalState, string> = {
  pendiente:  "Pendiente",
  confirmado: "Confirmado",
  ausente:    "Ausente",
  finalizado: "Finalizado",
  cancelado:  "Cancelado",
  sobreturno: "Sobreturno",
};

/** Tailwind tokens for the month-grid pill (`evt-pill state-*`). */
export const STATE_PILL_CLASS: Record<CalState, string> = {
  pendiente:  "border-l-[#d28b1c] bg-[#fcefdc] text-[#7a4900]",
  confirmado: "border-l-[#1d6db5] bg-[#dceaf7] text-[#0f4880]",
  ausente:    "border-l-[#c0392b] bg-[#fbe7e3] text-[#7a1f15]",
  finalizado: "border-l-[#1f8a5b] bg-[#e2f3eb] text-[#0f5a3a]",
  cancelado:  "border-l-[#7a8a92] bg-[#e8ecee] text-muted-foreground line-through",
  sobreturno: "border-l-[#e07a17] bg-[#fde6cf] text-[#7a3d00]",
};

/** Tailwind tokens for the day-timeline event (`tl-event state-*`). */
export const STATE_TIMELINE_CLASS: Record<CalState, string> = {
  pendiente:  "border-l-[#d28b1c] bg-[#fffaf2]",
  confirmado: "border-l-[#1d6db5] bg-[#f6faff]",
  ausente:    "border-l-[#c0392b] bg-[#fff7f5]",
  finalizado: "border-l-[#1f8a5b] bg-[#f4fbf7]",
  cancelado:  "border-l-[#7a8a92] bg-[#f7f9fa] opacity-75",
  sobreturno: "border-l-[#e07a17] bg-[#fff9f1] border-dashed",
};

/** Tailwind tokens for the week-view event (`wk-event state-*`). */
export const STATE_WEEK_CLASS: Record<CalState, string> = {
  pendiente:  "border-l-[#d28b1c] bg-[#fcefdc]",
  confirmado: "border-l-[#1d6db5] bg-[#dceaf7]",
  ausente:    "border-l-[#c0392b] bg-[#fbe7e3]",
  finalizado: "border-l-[#1f8a5b] bg-[#e2f3eb]",
  cancelado:  "border-l-[#7a8a92] bg-[#e8ecee] opacity-75",
  sobreturno: "border-l-[#e07a17] bg-[#fde6cf]",
};

/** Tokens for the rail day-list bar (`rail-item .ri-bar`). */
export const STATE_BAR_CLASS: Record<CalState, string> = {
  pendiente:  "bg-[#d28b1c]",
  confirmado: "bg-[#1d6db5]",
  ausente:    "bg-[#c0392b]",
  finalizado: "bg-[#1f8a5b]",
  cancelado:  "bg-[#7a8a92]",
  sobreturno: "bg-[#e07a17]",
};

/** Small dot color (legend / filter chip / day-list summary). */
export const STATE_DOT_CLASS: Record<CalState, string> = STATE_BAR_CLASS;

/** Badge tokens (`badge badge-*`) for agenda rows + drawer state-buttons. */
export const STATE_BADGE_CLASS: Record<CalState, string> = {
  pendiente:  "bg-[#fcefdc] text-[#7a4900] border-[#e7c897]",
  confirmado: "bg-[#dceaf7] text-[#0f4880] border-[#b6cfe6]",
  ausente:    "bg-[#fbe7e3] text-[#7a1f15] border-[#e6b1a6]",
  finalizado: "bg-[#e2f3eb] text-[#0f5a3a] border-[#a9d6bd]",
  cancelado:  "bg-[#e8ecee] text-[#3f4d54] border-[#c6cfd3]",
  sobreturno: "bg-[#fde6cf] text-[#7a3d00] border-[#e7c397]",
};

/** Colored stat number in the rail stats grid (`rail-stat .num.<state>`). */
export const STATE_STAT_NUM_CLASS: Record<CalState, string> = {
  pendiente:  "text-[#d28b1c]",
  confirmado: "text-[#1d6db5]",
  ausente:    "text-[#c0392b]",
  finalizado: "text-[#1f8a5b]",
  cancelado:  "text-[#7a8a92]",
  sobreturno: "text-[#e07a17]",
};

// ─── Capacity / work hours helpers ───────────────────────────────────────────

/** Given a user preference for a day, return the configured capacity in 30-min
 *  slots (default of 30 min per turno). */
export function capacityFromPreference(pref: UserPreference | undefined): number {
  if (!pref) return 0;
  let total = 0;
  if (pref.fromHourAM && pref.toHourAM) {
    total += (parseInt(pref.toHourAM, 10) - parseInt(pref.fromHourAM, 10)) * 2;
  }
  if (pref.fromHourPM && pref.toHourPM) {
    total += (parseInt(pref.toHourPM, 10) - parseInt(pref.fromHourPM, 10)) * 2;
  }
  return Math.max(0, total);
}

/** Build the list of "closed bands" for a day timeline given the work hours.
 *  Returns an array of [fromMinutes, toMinutes] ranges that should be hatched
 *  as "outside work hours". */
export function closedBands(
  pref: UserPreference | undefined,
  startHour: number,
  endHour: number,
): Array<[number, number]> {
  if (!pref) return [[startHour * 60, endHour * 60]];
  const amFrom = pref.fromHourAM ? parseInt(pref.fromHourAM, 10) : null;
  const amTo   = pref.toHourAM   ? parseInt(pref.toHourAM,   10) : null;
  const pmFrom = pref.fromHourPM ? parseInt(pref.fromHourPM, 10) : null;
  const pmTo   = pref.toHourPM   ? parseInt(pref.toHourPM,   10) : null;

  const open: Array<[number, number]> = [];
  if (amFrom !== null && amTo !== null) open.push([amFrom * 60, amTo * 60]);
  if (pmFrom !== null && pmTo !== null) open.push([pmFrom * 60, pmTo * 60]);

  if (open.length === 0) return [[startHour * 60, endHour * 60]];

  const bands: Array<[number, number]> = [];
  let cursor = startHour * 60;
  for (const [a, b] of open.sort((x, y) => x[0] - y[0])) {
    if (cursor < a) bands.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < endHour * 60) bands.push([cursor, endHour * 60]);
  return bands;
}

/** Return free 30-min slots inside the configured work hours that don't
 *  overlap any shift. Used by the day view "+ Libre" placeholders. */
export function freeSlots(
  pref: UserPreference | undefined,
  shifts: Shift[],
  slotMins = 30,
): Array<{ startMin: number; endMin: number }> {
  if (!pref) return [];
  const ranges: Array<[number, number]> = [];
  if (pref.fromHourAM && pref.toHourAM)
    ranges.push([parseInt(pref.fromHourAM, 10) * 60, parseInt(pref.toHourAM, 10) * 60]);
  if (pref.fromHourPM && pref.toHourPM)
    ranges.push([parseInt(pref.fromHourPM, 10) * 60, parseInt(pref.toHourPM, 10) * 60]);

  // Mark occupied minutes from active shifts (skip cancelled).
  const occupied = new Set<number>();
  for (const s of shifts) {
    if (s.status === "CANCELLED") continue;
    const start = toMinutes(new Date(s.start));
    const end = toMinutes(new Date(s.end));
    for (let m = start; m < end; m += slotMins) occupied.add(m);
  }

  const out: Array<{ startMin: number; endMin: number }> = [];
  for (const [a, b] of ranges) {
    for (let m = a; m + slotMins <= b; m += slotMins) {
      if (!occupied.has(m)) out.push({ startMin: m, endMin: m + slotMins });
    }
  }
  return out;
}

// ─── Date formatters (Spanish, Argentina) ────────────────────────────────────

export function fmtDayLong(d: Date): string {
  return capitalize(
    d.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );
}

export function fmtDayShort(d: Date): string {
  return capitalize(
    d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })
  );
}

export function fmtMonthYear(d: Date): string {
  return capitalize(d.toLocaleDateString("es-AR", { month: "long", year: "numeric" }));
}
