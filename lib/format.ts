// Formato de fechas, horas y texto compartido por cliente y servidor (sin
// dependencias). Antes cada card, diálogo y ruta tenía su propia copia de
// «HH:mm», «dd/mm/aaaa», edad, «en N min», etc.; acá vive la única versión.
//
// Todo trabaja en hora local del proceso (en el navegador, la del consultorio).
// Para cortes «por día» en el servidor usar lib/clinic-time.ts.

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/** "09:05" (24 h). Acepta Date o ISO. */
export function formatTime(d: Date | string): string {
  const x = toDate(d);
  return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}

/** "9:05 a. m." / "3:40 p. m." (como lo escribe es-AR). */
export function formatTimeAmPm(d: Date | string): string {
  const x = toDate(d);
  let h = x.getHours();
  const m = x.getMinutes();
  const ampm = h >= 12 ? "p. m." : "a. m.";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${pad2(m)} ${ampm}`;
}

/** "25/09/2026"; "—" si no hay fecha. */
export function formatDateAR(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = toDate(d);
  if (Number.isNaN(x.getTime())) return "—";
  return `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}/${x.getFullYear()}`;
}

/** "25/09/26". */
export function formatDateShortAR(d: Date | string): string {
  const x = toDate(d);
  return `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}/${String(x.getFullYear()).slice(-2)}`;
}

/** "Viernes, 25 de septiembre de 2026". */
export function formatDateLong(d: Date | string): string {
  const s = toDate(d).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return capitalize(s);
}

/** "YYYY-MM-DD" en hora local (nunca `toISOString`, que corre el día en UTC). */
export function toLocalDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Minúsculas y sin acentos, para comparar búsquedas: "Gómez" coincide con "gomez". */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Edad cumplida a hoy; null sin fecha válida. */
export function calcAge(birth?: string | Date | null): number | null {
  if (!birth) return null;
  const b = toDate(birth);
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}

/** Minutos enteros desde `from` hasta `now` (nunca negativos). */
export function minutesSince(from: Date | string, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - toDate(from).getTime()) / 60000));
}

/** Minutos enteros hasta `until` (nunca negativos). */
export function minutesUntil(until: Date | string, now: Date = new Date()): number {
  return Math.max(0, Math.round((toDate(until).getTime() - now.getTime()) / 60000));
}

/** "ahora", "en 5 min", "en 1 h", "en 1 h 20 min". */
export function formatEta(minutes: number): string {
  if (minutes <= 0) return "ahora";
  if (minutes < 60) return `en ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `en ${h} h` : `en ${h} h ${m} min`;
}

/** DNI con puntos de miles: "33891234" → "33.891.234". Devuelve el original si no parece un DNI. */
export function formatDni(dni: string | null | undefined): string | null {
  if (!dni) return null;
  const digits = dni.replace(/\D/g, "");
  if (digits.length < 7) return dni;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
