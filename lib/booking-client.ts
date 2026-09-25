// Helpers puros (sin Node ni DOM) para la reserva online pública.
// Contrato: lib/openapi/paths/online-booking.ts
//
// Fechas: los días de disponibilidad llegan como "YYYY-MM-DD" (fecha civil en
// hora AR) y se manipulan como fechas UTC a mediodía para que ningún huso
// horario del navegador corra el día. Los instantes (`start`) se formatean
// siempre en America/Argentina/Buenos_Aires.

import { z } from "zod";
import { capitalize } from "@/lib/format";
export { capitalize };

export const AR_TZ = "America/Argentina/Buenos_Aires";

// ─── Fechas ─────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

/** Hoy en Argentina como "YYYY-MM-DD". */
export function todayAR(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dateOnlyToUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function addDaysISO(date: string, days: number): string {
  const d = dateOnlyToUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días enteros de `from` a `to` (positivo si `to` es posterior). */
export function diffDaysISO(from: string, to: string): number {
  return Math.round((dateOnlyToUtc(to).getTime() - dateOnlyToUtc(from).getTime()) / 86_400_000);
}

export function maxISO(a: string, b: string): string {
  return a >= b ? a : b;
}


/** Partes para una píldora de día: { weekday: "Mar", day: "30", month: "sep" }. */
export function dayPillParts(date: string): { weekday: string; day: string; month: string } {
  const d = dateOnlyToUtc(date);
  const weekday = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const month = d.toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return { weekday: capitalize(weekday), day: String(d.getUTCDate()), month };
}

/** "Martes 30 de septiembre" a partir de "YYYY-MM-DD". */
export function formatDateOnlyLong(date: string): string {
  const d = dateOnlyToUtc(date);
  return capitalize(d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));
}

/** "22 – 28 de septiembre" / "29 de sep – 5 de oct". */
export function formatWeekRange(from: string, to: string): string {
  const a = dateOnlyToUtc(from);
  const b = dateOnlyToUtc(to);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  if (sameMonth) {
    const month = b.toLocaleDateString("es-AR", { month: "long", timeZone: "UTC" });
    return `${a.getUTCDate()} – ${b.getUTCDate()} de ${month}`;
  }
  const fa = a.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  const fb = b.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  return `${fa} – ${fb}`;
}

function validInstant(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Martes 30 de septiembre" para un instante, en hora AR. */
export function formatBookingDate(iso: string): string {
  const d = validInstant(iso);
  if (!d) return "—";
  return capitalize(d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: AR_TZ }));
}

/** "10:30" para un instante, en hora AR. */
export function formatBookingTime(iso: string): string {
  const d = validInstant(iso);
  if (!d) return "—";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: AR_TZ });
}

/** "Mar 30/09" para un instante, en hora AR (listas compactas de recepción). */
export function formatBookingDateShort(iso: string): string {
  const d = validInstant(iso);
  if (!d) return "—";
  const weekday = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: AR_TZ }).replace(".", "");
  const dm = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: AR_TZ });
  return `${capitalize(weekday)} ${dm}`;
}

/** true si el instante ya pasó (con margen). */
export function isPast(iso: string, marginMs = 0, now: number = Date.now()): boolean {
  const d = validInstant(iso);
  return !d || d.getTime() - marginMs <= now;
}

/** "10:30" → true si es de la mañana (antes de las 13). */
export function isMorning(time: string): boolean {
  const h = parseInt(time.split(":")[0] ?? "", 10);
  return Number.isFinite(h) && h < 13;
}

// ─── Link de gestión ────────────────────────────────────────────────────────

/** Los tokens son base64url; cualquier otra cosa no vale la pena consultarla. */
export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Solo acepta el link de gestión como ruta propia ("/reserva/<token>") o URL
 * http(s) absoluta; cualquier otra cosa (p. ej. `javascript:`) se descarta.
 */
export function safeManageUrl(url: unknown): string {
  if (typeof url !== "string" || !url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

// ─── Datos del paciente (paso 3) ────────────────────────────────────────────

export function onlyDigits(value: string, max = 10): string {
  return value.replace(/\D/g, "").slice(0, max);
}

const PHONE_RE = /^[0-9+()\-\s.]+$/;

/**
 * Validación del lado del cliente (el servidor vuelve a validar). A propósito
 * no hay campo de motivo: el formulario público no captura datos de salud.
 */
export const bookingPatientSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre")
    .max(100, "Máx. 100 caracteres"),
  lastName: z
    .string()
    .trim()
    .min(2, "Ingresá tu apellido")
    .max(100, "Máx. 100 caracteres"),
  dni: z.string().regex(/^[0-9]{6,10}$/, "Ingresá tu DNI sin puntos (6 a 10 números)"),
  phone: z
    .string()
    .trim()
    .max(30, "Máx. 30 caracteres")
    .refine((v) => PHONE_RE.test(v) && v.replace(/\D/g, "").length >= 8, {
      message: "Ingresá un celular con código de área (ej.: 11 5555-5555)",
    }),
  email: z.union([z.string().trim().email("Revisá el email"), z.literal("")]),
  healthInsurance: z.string().trim().max(80, "Máx. 80 caracteres"),
  privacyAccepted: z.boolean().refine((v) => v === true, {
    message: "Para reservar necesitamos que aceptes el uso de tus datos",
  }),
});

export type BookingPatientValues = z.infer<typeof bookingPatientSchema>;
export type BookingPatientField = keyof BookingPatientValues;

export const BOOKING_PATIENT_FIELDS: readonly BookingPatientField[] = [
  "firstName",
  "lastName",
  "dni",
  "phone",
  "email",
  "healthInsurance",
  "privacyAccepted",
];

export const EMPTY_BOOKING_PATIENT: BookingPatientValues = {
  firstName: "",
  lastName: "",
  dni: "",
  phone: "",
  email: "",
  healthInsurance: "",
  privacyAccepted: false,
};

// ─── Errores del POST /api/public/booking ───────────────────────────────────

export type BookingSubmitError =
  | { kind: "slot_taken"; message: string }
  | { kind: "too_many_pending"; message: string }
  | { kind: "out_of_window"; message: string }
  | { kind: "medic_unavailable"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "disabled"; message: string }
  | { kind: "fields"; message: string; fields: Partial<Record<BookingPatientField, string>>; slotInvalid: boolean }
  | { kind: "unknown"; message: string };

type ErrorBody = {
  code?: unknown;
  error?: unknown;
  details?: { fieldErrors?: Record<string, unknown> } | null;
} | null;

function firstMessage(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string" && x.trim());
    return typeof s === "string" ? s : null;
  }
  return null;
}

/** Traduce una respuesta de error del POST a algo accionable por el asistente. */
export function parseBookingSubmitError(status: number, body: ErrorBody): BookingSubmitError {
  const code = typeof body?.code === "string" ? body.code : null;
  const serverMsg = typeof body?.error === "string" && body.error.trim() ? body.error : null;

  if (status === 409 && code === "TOO_MANY_PENDING") {
    return {
      kind: "too_many_pending",
      message:
        "Ya tenés varias reservas pendientes de confirmar con ese DNI. Esperá a que recepción las confirme o cancelá alguna desde su link antes de pedir otra.",
    };
  }
  if (status === 409) {
    return {
      kind: "slot_taken",
      message: "Ese horario se acaba de ocupar. Elegí otro, por favor.",
    };
  }
  if (status === 422 && code === "MEDIC_UNAVAILABLE") {
    return {
      kind: "medic_unavailable",
      message: "Ese profesional ya no toma reservas online. Elegí otro o escribinos.",
    };
  }
  if (status === 422) {
    return {
      kind: "out_of_window",
      message:
        serverMsg ?? "Ese horario ya no se puede reservar online. Elegí otro de los disponibles.",
    };
  }
  if (status === 429) {
    return { kind: "rate_limited", message: "Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo." };
  }
  if (status === 503) {
    return { kind: "disabled", message: "Las reservas online no están disponibles en este momento." };
  }
  if (status === 400) {
    const raw = body?.details?.fieldErrors ?? {};
    const fields: Partial<Record<BookingPatientField, string>> = {};
    for (const f of BOOKING_PATIENT_FIELDS) {
      const m = firstMessage(raw[f]);
      if (m) fields[f] = m;
    }
    const slotInvalid = ["medicId", "start", "consultationTypeId"].some((k) => firstMessage(raw[k]));
    return {
      kind: "fields",
      message: serverMsg ?? "Revisá los datos marcados.",
      fields,
      slotInvalid,
    };
  }
  return { kind: "unknown", message: "No pudimos registrar tu reserva. Probá de nuevo en unos minutos." };
}
