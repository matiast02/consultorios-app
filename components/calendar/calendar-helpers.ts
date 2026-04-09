// ─── Constants ───────────────────────────────────────────────────────────────

export const HOURS_START = 7;
export const HOURS_END = 21;
export const HOUR_SLOTS = Array.from(
  { length: HOURS_END - HOURS_START },
  (_, i) => HOURS_START + i
);

// ─── Utility Functions ────────────────────────────────────────────────────────

export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
