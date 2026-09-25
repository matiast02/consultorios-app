"use client";

import type { AgendaShiftMini } from "@/types";
import { formatTime, formatTimeAmPm } from "@/lib/format";
import { SHIFT_STATUS_BLOCK, SHIFT_STATUS_RING } from "@/lib/shift-status";

// Alias históricos de la agenda: la paleta vive en lib/shift-status.ts.
export const STATUS_BG = SHIFT_STATUS_BLOCK;
export const STATUS_RING = SHIFT_STATUS_RING;

// Alias históricos de la agenda: la implementación vive en lib/format.ts.
export const formatHHmmShort = (iso: string) => formatTimeAmPm(iso);
export const formatHHmm24 = (iso: string) => formatTime(iso);
export const currentTimeLabel = () => formatTimeAmPm(new Date());

export const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08..18

export function getHourFromIso(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}



export function getNowHour(): number {
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60;
}


/** Shorten patient name like "García, M." → keep as is. */
export function shortPatient(s: AgendaShiftMini): string {
  return s.patientShortName ?? "—";
}
