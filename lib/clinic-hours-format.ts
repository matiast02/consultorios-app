// Mapeo Monday-start (coincide con ClinicHours.dayOfWeek 0=Lun..6=Dom).
// Nota: NO confundir con types/index.ts DAY_NAMES (Sunday-start, usado por el calendario).

export const DAY_SHORT_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export const DAY_LONG_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export function formatRange(open?: string | null, close?: string | null): string | null {
  if (!open || !close) return null;
  const o = open.replace(/^0/, "");
  const c = close.replace(/^0/, "");
  return `${o} – ${c} h`;
}

export function dayShortLabel(dow: number): string {
  return DAY_SHORT_LABELS[((dow % 7) + 7) % 7];
}

export function dayLongLabel(dow: number): string {
  return DAY_LONG_LABELS[((dow % 7) + 7) % 7];
}
