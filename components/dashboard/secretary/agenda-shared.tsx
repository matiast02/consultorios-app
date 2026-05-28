"use client";

import type { AgendaShiftMini, ShiftStatus } from "@/types";

export const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08..18

export const STATUS_BG: Record<ShiftStatus, string> = {
  FINISHED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  CONFIRMED: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  ABSENT: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  CANCELLED: "bg-slate-100 text-slate-600 line-through dark:bg-slate-800/40 dark:text-slate-400",
};

export const STATUS_RING: Record<ShiftStatus, string> = {
  FINISHED: "ring-emerald-300/60",
  CONFIRMED: "ring-sky-300/60",
  PENDING: "ring-amber-300/60",
  ABSENT: "ring-rose-300/60",
  CANCELLED: "ring-slate-300/60",
};

export function getHourFromIso(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

export function formatHHmmShort(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p. m." : "a. m.";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatHHmm24(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function getNowHour(): number {
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60;
}

export function currentTimeLabel(): string {
  const n = new Date();
  let h = n.getHours();
  const m = n.getMinutes();
  const ampm = h >= 12 ? "p. m." : "a. m.";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Shorten patient name like "García, M." → keep as is. */
export function shortPatient(s: AgendaShiftMini): string {
  return s.patientShortName ?? "—";
}
