// Estado del turno: etiqueta y una sola paleta para toda la app. Antes había
// ocho mapas repartidos por cards, diálogos, pestañas y estadísticas, y el
// mismo estado salía cyan, sky o azul según la pantalla.
//
//   PENDING   ámbar    CONFIRMED  sky      ABSENT  rosa
//   FINISHED  esmeralda   CANCELLED  gris
//
// `types/index.ts` re-exporta estos mapas con sus nombres históricos.

import type { ShiftStatus } from "@/types";

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  ABSENT: "Ausente",
  FINISHED: "Finalizado",
  CANCELLED: "Cancelado",
};

/** Punto o barra de color. */
export const SHIFT_STATUS_DOT: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-500",
  CONFIRMED: "bg-sky-500",
  ABSENT: "bg-rose-500",
  FINISHED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
};

/** Texto coloreado (al lado del punto, cifras de estadísticas). */
export const SHIFT_STATUS_TEXT: Record<ShiftStatus, string> = {
  PENDING: "text-amber-700 dark:text-amber-400",
  CONFIRMED: "text-sky-700 dark:text-sky-400",
  ABSENT: "text-rose-700 dark:text-rose-400",
  FINISHED: "text-emerald-700 dark:text-emerald-400",
  CANCELLED: "text-slate-500 dark:text-slate-400",
};

/** Chip relleno sin borde (ficha rápida, encabezados). */
export const SHIFT_STATUS_BADGE: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  CONFIRMED: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  ABSENT: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  FINISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  CANCELLED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/** Chip con borde (listados de turnos, tablas). */
export const SHIFT_STATUS_BADGE_OUTLINE: Record<ShiftStatus, string> = {
  PENDING:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
  CONFIRMED:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300",
  ABSENT:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300",
  FINISHED:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300",
  CANCELLED:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

/** Bloque de agenda (fondo + texto; cancelado tachado). */
export const SHIFT_STATUS_BLOCK: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  CONFIRMED: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  ABSENT: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  FINISHED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 line-through dark:bg-slate-800/40 dark:text-slate-400",
};

/** Anillo del bloque de agenda seleccionado. */
export const SHIFT_STATUS_RING: Record<ShiftStatus, string> = {
  PENDING: "ring-amber-300/60",
  CONFIRMED: "ring-sky-300/60",
  ABSENT: "ring-rose-300/60",
  FINISHED: "ring-emerald-300/60",
  CANCELLED: "ring-slate-300/60",
};

export const SHIFT_STATUSES: ShiftStatus[] = ["PENDING", "CONFIRMED", "ABSENT", "FINISHED", "CANCELLED"];
