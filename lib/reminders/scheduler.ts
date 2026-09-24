// Planificación y despacho de recordatorios de turnos.
//
// Ciclo (cron cada 15-30 min vía POST /api/cron/reminders, botón de recepción
// o `pnpm reminders:run`):
//
//   1. planReminders(): crea los ShiftReminder que faltan para los turnos
//      PENDING/CONFIRMED que empiezan dentro de la ventana
//      [ahora, ahora + mayor anticipación configurada + 1 h]. Uno por offset
//      (24 h y opcionalmente un segundo, p.ej. 2 h). Idempotente por
//      @@unique([shiftId, offsetHours]).
//   2. dispatchDue(): toma los PENDING con scheduledFor <= ahora. EMAIL → se
//      envía (SENT / FAILED). WHATSAPP → queda PENDING y manual: recepción lo
//      envía con el link wa.me (click-to-chat) y lo marca como enviado.
//
// Token del link de confirmación (/turno/<token>): en la base solo está el
// hash (sha256). El token en claro NO se guarda: se deriva con
// HMAC(AUTH_SECRET, id del recordatorio). Es estable a propósito: el dashboard
// de recepción recalcula el waLink en cada polling y, si rotáramos el token en
// cada cálculo, el link que ya se mandó por WhatsApp dejaría de funcionar.
// ensureToken() persiste el hash del token que devuelve, así todo link emitido
// es válido. Rotar AUTH_SECRET invalida los links pendientes (igual que las sesiones).
//
// Privacidad: los mensajes llevan nombre de pila, fecha, hora, profesional y
// dirección. Nada clínico (ni observaciones ni tipo de consulta).

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/notifications/email";
import {
  formatReminderTime,
  reminderEmailHtml,
  reminderEmailSubject,
  renderReminderText,
  toWhatsappDigits,
  whatsappLink,
} from "@/lib/reminders/message";
import { confirmationUrl, generateConfirmationToken, hashConfirmationToken } from "@/lib/reminders/tokens";
import type {
  ReminderChannel,
  ReminderDispatchSummary,
  ReminderItem,
  ReminderResponse,
  ReminderSettings,
  ReminderStatus,
} from "@/types";

// ─── Constantes ──────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;

/** Margen de la ventana de planificación: el recordatorio se crea hasta 1 h antes de su hora de envío. */
export const PLANNING_MARGIN_MS = HOUR_MS;

/**
 * Un recordatorio "atrasado" (su hora de envío ya pasó, p.ej. turno sacado con
 * menos de 24 h o cron caído) solo se recupera si es el de menor anticipación
 * (si queda uno posterior, ese lo cubre) y si falta al menos esto para el turno.
 */
export const MIN_CATCHUP_LEAD_MS = HOUR_MS;

/** Reserva de un EMAIL mientras se envía (evita doble envío entre cron y botón de recepción). */
const EMAIL_LEASE_MS = 10 * 60 * 1000;

/** Máximo de recordatorios procesados por corrida de dispatch. */
const DISPATCH_BATCH = 200;

const ACTIVE_SHIFT_STATUSES = ["PENDING", "CONFIRMED"] as const;

export const REMINDER_ERRORS = {
  shiftNotActive: "Turno ya no vigente",
  expired: "Vencido: el turno empezó sin que se enviara el recordatorio",
  optOut: "El paciente pidió no recibir recordatorios",
  noContact: "Sin email ni WhatsApp válido para los canales habilitados",
  emailFailed: "No se pudo enviar el email",
} as const;

const VALID_CHANNELS: readonly ReminderChannel[] = ["EMAIL", "WHATSAPP", "SMS"];
const DEFAULT_CHANNELS: readonly ReminderChannel[] = ["EMAIL", "WHATSAPP"];

export const DEFAULT_REMINDER_SETTINGS: Readonly<ReminderSettings> = {
  remindersEnabled: true,
  reminderHoursBefore: 24,
  reminderSecondHoursBefore: null,
  reminderChannels: [...DEFAULT_CHANNELS],
  reminderTemplate: null,
};

// ─── Configuración ───────────────────────────────────────────────────────────

/** Configuración de recordatorios + datos del consultorio que van en el mensaje. */
export interface ReminderConfig extends ReminderSettings {
  clinicName: string | null;
  address: string | null;
}

export function emptySummary(): ReminderDispatchSummary {
  return { planned: 0, sentEmail: 0, manualPending: 0, failed: 0, skippedOptOut: 0, skippedNoContact: 0 };
}

/**
 * Parsea ClinicSettings.reminderChannels con tolerancia: JSON array, string
 * suelto o lista separada por comas; ignora valores desconocidos y duplicados,
 * acepta minúsculas. Si no se puede interpretar → canales por defecto.
 * Solo un array (JSON) explícito puede dejar la lista vacía (ningún canal).
 */
export function parseReminderChannels(raw: unknown): ReminderChannel[] {
  let value: unknown = raw;
  let explicitArray = Array.isArray(raw);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [...DEFAULT_CHANNELS];
    try {
      value = JSON.parse(s);
      explicitArray = Array.isArray(value);
    } catch {
      value = s.split(/[\s,;]+/);
    }
    if (typeof value === "string") value = value.split(/[\s,;]+/);
  }
  if (!Array.isArray(value)) return [...DEFAULT_CHANNELS];
  const out: ReminderChannel[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const up = v.trim().toUpperCase() as ReminderChannel;
    if (VALID_CHANNELS.includes(up) && !out.includes(up)) out.push(up);
  }
  return out.length > 0 || explicitArray ? out : [...DEFAULT_CHANNELS];
}

function validHours(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

export function formatClinicAddress(line1?: string | null, line2?: string | null): string | null {
  const parts = [line1, line2].map((s) => s?.trim()).filter((s): s is string => !!s);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** ClinicSettings (id "default") → configuración de recordatorios, con defaults si no existe. */
export async function loadReminderConfig(): Promise<ReminderConfig> {
  const row = await prisma.clinicSettings.findUnique({
    where: { id: "default" },
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      remindersEnabled: true,
      reminderHoursBefore: true,
      reminderSecondHoursBefore: true,
      reminderChannels: true,
      reminderTemplate: true,
    },
  });
  if (!row) {
    return { ...DEFAULT_REMINDER_SETTINGS, reminderChannels: [...DEFAULT_CHANNELS], clinicName: null, address: null };
  }
  return {
    remindersEnabled: row.remindersEnabled ?? true,
    reminderHoursBefore: validHours(row.reminderHoursBefore, 1, 168) ?? DEFAULT_REMINDER_SETTINGS.reminderHoursBefore,
    reminderSecondHoursBefore: validHours(row.reminderSecondHoursBefore, 1, 48),
    reminderChannels: parseReminderChannels(row.reminderChannels),
    reminderTemplate: row.reminderTemplate?.trim() || null,
    clinicName: row.name?.trim() || null,
    address: formatClinicAddress(row.addressLine1, row.addressLine2),
  };
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const c = await loadReminderConfig();
  return {
    remindersEnabled: c.remindersEnabled,
    reminderHoursBefore: c.reminderHoursBefore,
    reminderSecondHoursBefore: c.reminderSecondHoursBefore,
    reminderChannels: c.reminderChannels,
    reminderTemplate: c.reminderTemplate,
  };
}

/** Offsets configurados (horas antes del turno), sin duplicados, de mayor a menor. */
export function reminderOffsets(
  s: Pick<ReminderSettings, "reminderHoursBefore" | "reminderSecondHoursBefore">,
): number[] {
  const set = new Set<number>();
  for (const h of [s.reminderHoursBefore, s.reminderSecondHoursBefore]) {
    if (typeof h === "number" && Number.isInteger(h) && h > 0) set.add(h);
  }
  return [...set].sort((a, b) => b - a);
}

// ─── Canal ───────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ChannelChoice {
  channel: ReminderChannel;
  manual: boolean;
  /** Email o teléfono al que se envía. */
  to: string;
}

/**
 * EMAIL si el paciente tiene email y el canal está habilitado; si no, WHATSAPP
 * (manual, click-to-chat) si tiene un teléfono utilizable y el canal está
 * habilitado; si no, null (sin contacto).
 */
export function chooseChannel(
  patient: { email?: string | null; telephone?: string | null },
  channels: readonly ReminderChannel[],
): ChannelChoice | null {
  const email = patient.email?.trim();
  if (email && EMAIL_RE.test(email) && channels.includes("EMAIL")) {
    return { channel: "EMAIL", manual: false, to: email };
  }
  const phone = patient.telephone?.trim();
  if (phone && channels.includes("WHATSAPP") && toWhatsappDigits(phone)) {
    return { channel: "WHATSAPP", manual: true, to: phone };
  }
  return null;
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

function tokenSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET no configurado: no se pueden generar links de confirmación");
  }
  return "dev-only-reminder-link-secret";
}

/** Token en claro del link de confirmación de un recordatorio (estable, derivado por HMAC). */
export function deriveConfirmationToken(reminderId: string): string {
  return crypto
    .createHmac("sha256", tokenSecret())
    .update(`shift-reminder-link:v1:${reminderId}`, "utf8")
    .digest()
    .subarray(0, 24)
    .toString("base64url");
}

/**
 * Devuelve el token en claro del recordatorio y garantiza que su hash (y el
 * vencimiento = inicio del turno) estén persistidos. Solo escribe si cambió algo.
 */
export async function ensureToken(
  reminderId: string,
  opts: { currentHash?: string | null; currentExpiresAt?: Date | null; expiresAt?: Date } = {},
): Promise<string> {
  const token = deriveConfirmationToken(reminderId);
  const hash = hashConfirmationToken(token);
  const data: { tokenHash?: string; tokenExpiresAt?: Date } = {};
  if (opts.currentHash !== hash) data.tokenHash = hash;
  if (opts.expiresAt && opts.currentExpiresAt?.getTime() !== opts.expiresAt.getTime()) {
    data.tokenExpiresAt = opts.expiresAt;
  }
  if (data.tokenHash !== undefined || data.tokenExpiresAt !== undefined) {
    await prisma.shiftReminder.update({ where: { id: reminderId }, data });
  }
  return token;
}

// ─── Nombres ─────────────────────────────────────────────────────────────────

export interface MedicNameInfo {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}

/** "Dr. Pérez" / "Dra. Gómez" (misma heurística que el dashboard de recepción). */
export function medicShortName(u: MedicNameInfo | null | undefined): string {
  if (!u) return "Profesional";
  const fn = u.firstName?.trim() ?? "";
  const ln = u.lastName?.trim() ?? "";
  const honor = fn.toLowerCase().endsWith("a") ? "Dra." : "Dr.";
  if (ln) return `${honor} ${ln}`;
  if (fn) return `${honor} ${fn}`;
  return u.name?.trim() || "Profesional";
}

export function firstGivenName(firstName: string | null | undefined): string {
  return (firstName ?? "").trim().split(/\s+/)[0] ?? "";
}

function patientShortName(p: { firstName: string; lastName: string } | null | undefined): string {
  if (!p) return "Paciente";
  const ln = p.lastName?.trim();
  const fn = firstGivenName(p.firstName);
  if (ln) return fn ? `${ln}, ${fn}` : ln;
  return fn || "Paciente";
}

export function isActiveShiftStatus(status: string): boolean {
  return (ACTIVE_SHIFT_STATUSES as readonly string[]).includes(status);
}

function asResponse(v: string | null | undefined): ReminderResponse | null {
  return v === "CONFIRMED" || v === "CANCELLED" ? v : null;
}

function asChannel(v: string | null | undefined): ReminderChannel {
  const up = (v ?? "").toUpperCase() as ReminderChannel;
  return VALID_CHANNELS.includes(up) ? up : "EMAIL";
}

function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

/**
 * Crea los recordatorios que faltan para los turnos de la ventana
 * [now, now + mayor offset + 1 h]. Idempotente.
 *
 * - Opt-out → no se crea (skippedOptOut, por turno).
 * - Sin contacto utilizable → no se crea (skippedNoContact, por turno).
 * - Turno reprogramado (tokenExpiresAt ≠ start) → se resincronizan sus PENDING.
 * - PENDING de offsets que ya no están configurados → se descartan.
 */
export async function planReminders(now: Date = new Date()): Promise<ReminderDispatchSummary> {
  const summary = emptySummary();
  const config = await loadReminderConfig();
  if (!config.remindersEnabled) return summary;

  const offsets = reminderOffsets(config);
  if (offsets.length === 0) return summary;
  const smallest = offsets[offsets.length - 1];
  const nowMs = now.getTime();
  const windowEnd = new Date(nowMs + offsets[0] * HOUR_MS + PLANNING_MARGIN_MS);

  // Cambio de configuración (p.ej. el segundo recordatorio pasó de 2 h a 3 h):
  // los pendientes de offsets que ya no existen nunca se enviaron → se descartan.
  await prisma.shiftReminder.deleteMany({
    where: { status: "PENDING", offsetHours: { notIn: offsets }, shift: { start: { gt: now } } },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      status: { in: [...ACTIVE_SHIFT_STATUSES] },
      start: { gt: now, lte: windowEnd },
      patient: { deletedAt: null },
    },
    select: {
      id: true,
      start: true,
      patient: { select: { email: true, telephone: true, reminderOptOut: true } },
      reminders: { select: { id: true, offsetHours: true, status: true, tokenExpiresAt: true } },
    },
    orderBy: { start: "asc" },
  });

  const rows: Prisma.ShiftReminderCreateManyInput[] = [];
  const resyncs: Promise<unknown>[] = [];

  for (const shift of shifts) {
    const startMs = shift.start.getTime();
    const existing = new Set(shift.reminders.map((r) => r.offsetHours));

    // Turno reprogramado: los pendientes siguen al nuevo horario.
    for (const r of shift.reminders) {
      if (r.status !== "PENDING" || r.tokenExpiresAt?.getTime() === startMs) continue;
      resyncs.push(
        prisma.shiftReminder.update({
          where: { id: r.id },
          data: { scheduledFor: new Date(startMs - r.offsetHours * HOUR_MS), tokenExpiresAt: shift.start },
        }),
      );
    }

    const missing = offsets.filter((o) => {
      if (existing.has(o)) return false;
      if (startMs - o * HOUR_MS > nowMs) return true; // a tiempo
      return o === smallest && startMs - nowMs >= MIN_CATCHUP_LEAD_MS; // recuperación
    });
    if (missing.length === 0) continue;

    if (shift.patient.reminderOptOut) {
      summary.skippedOptOut++;
      continue;
    }
    const choice = chooseChannel(shift.patient, config.reminderChannels);
    if (!choice) {
      summary.skippedNoContact++;
      continue;
    }

    for (const offsetHours of missing) {
      rows.push({
        shiftId: shift.id,
        scheduledFor: new Date(startMs - offsetHours * HOUR_MS),
        status: "PENDING",
        channel: choice.channel,
        offsetHours,
        manual: choice.manual,
        // Placeholder único e inutilizable (el token en claro se descarta): el
        // link real se emite con ensureToken() al enviar / mostrar el waLink.
        tokenHash: generateConfirmationToken().hash,
        tokenExpiresAt: shift.start,
      });
    }
  }

  await Promise.all(resyncs);
  if (rows.length > 0) {
    const created = await prisma.shiftReminder.createMany({ data: rows, skipDuplicates: true });
    summary.planned = created.count;
  }
  return summary;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const DUE_INCLUDE = {
  shift: {
    select: {
      id: true,
      start: true,
      status: true,
      patient: {
        select: {
          firstName: true,
          email: true,
          telephone: true,
          reminderOptOut: true,
          deletedAt: true,
        },
      },
      user: { select: { firstName: true, lastName: true, name: true } },
    },
  },
} satisfies Prisma.ShiftReminderInclude;

type DueReminder = Prisma.ShiftReminderGetPayload<{ include: typeof DUE_INCLUDE }>;

type DispatchOutcome =
  | "sent"
  | "manual"
  | "failed"
  | "optOut"
  | "noContact"
  | "invalidated"
  | "deferred"
  | "busy";

async function markFailed(id: string, errorMessage: string, extra: Prisma.ShiftReminderUpdateInput = {}) {
  await prisma.shiftReminder.update({
    where: { id },
    data: { ...extra, status: "FAILED", errorMessage: truncate(errorMessage) },
  });
}

async function dispatchOne(r: DueReminder, config: ReminderConfig, now: Date): Promise<DispatchOutcome> {
  const { shift } = r;
  const patient = shift.patient;
  const nowMs = now.getTime();
  const startMs = shift.start.getTime();

  if (!isActiveShiftStatus(shift.status) || patient.deletedAt) {
    await markFailed(r.id, REMINDER_ERRORS.shiftNotActive);
    return "invalidated";
  }
  if (startMs <= nowMs) {
    await markFailed(r.id, REMINDER_ERRORS.expired);
    return "failed";
  }

  // Turno reprogramado a más adelante: todavía no corresponde → se reagenda.
  const dueMs = startMs - r.offsetHours * HOUR_MS;
  if (dueMs > nowMs) {
    await prisma.shiftReminder.update({
      where: { id: r.id },
      data: { scheduledFor: new Date(dueMs), tokenExpiresAt: shift.start },
    });
    return "deferred";
  }

  if (patient.reminderOptOut) {
    await markFailed(r.id, REMINDER_ERRORS.optOut);
    return "optOut";
  }

  // El contacto se reevalúa al enviar (el paciente pudo cargar o borrar su email).
  const choice = chooseChannel(patient, config.reminderChannels);
  if (!choice) {
    await markFailed(r.id, REMINDER_ERRORS.noContact);
    return "noContact";
  }

  if (choice.manual) {
    if (!r.manual || r.channel !== choice.channel || r.deliveredTo !== choice.to || r.errorMessage) {
      await prisma.shiftReminder.update({
        where: { id: r.id },
        data: { channel: choice.channel, manual: true, deliveredTo: choice.to, errorMessage: null },
      });
    }
    return "manual";
  }

  // EMAIL: se reserva el recordatorio (lock optimista sobre scheduledFor) para
  // que dos corridas simultáneas no manden el mismo email dos veces.
  const claim = await prisma.shiftReminder.updateMany({
    where: { id: r.id, status: "PENDING", scheduledFor: r.scheduledFor },
    data: { scheduledFor: new Date(nowMs + EMAIL_LEASE_MS), channel: "EMAIL", manual: false },
  });
  if (claim.count === 0) return "busy";

  const restore = { scheduledFor: new Date(dueMs), deliveredTo: choice.to };
  try {
    const token = await ensureToken(r.id, {
      currentHash: r.tokenHash,
      currentExpiresAt: r.tokenExpiresAt,
      expiresAt: shift.start,
    });
    const link = confirmationUrl(token);
    const input = {
      patientFirstName: firstGivenName(patient.firstName),
      start: shift.start,
      medicShortName: medicShortName(shift.user),
      clinicName: config.clinicName,
      address: config.address,
      confirmationLink: link,
      template: config.reminderTemplate,
    };
    const text = renderReminderText(input);
    const result = await sendEmail({
      to: choice.to,
      subject: reminderEmailSubject(input),
      text,
      html: reminderEmailHtml(text, link),
    });
    if (result.ok) {
      await prisma.shiftReminder.update({
        where: { id: r.id },
        data: { ...restore, status: "SENT", sentAt: now, errorMessage: null },
      });
      return "sent";
    }
    await markFailed(r.id, result.error || REMINDER_ERRORS.emailFailed, restore);
    return "failed";
  } catch (e) {
    await markFailed(r.id, e instanceof Error ? e.message : REMINDER_ERRORS.emailFailed, restore);
    return "failed";
  }
}

/**
 * Procesa los recordatorios PENDING vencidos (scheduledFor <= now).
 * `reminderId` limita a uno solo (reintento desde recepción); `force` ignora
 * `remindersEnabled` (acción explícita de recepción).
 */
export async function dispatchDue(
  now: Date = new Date(),
  opts: { reminderId?: string; force?: boolean } = {},
): Promise<ReminderDispatchSummary> {
  const summary = emptySummary();
  const config = await loadReminderConfig();
  if (!config.remindersEnabled && !opts.force) return summary;

  const due = await prisma.shiftReminder.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
      ...(opts.reminderId ? { id: opts.reminderId } : {}),
    },
    include: DUE_INCLUDE,
    orderBy: { scheduledFor: "asc" },
    take: DISPATCH_BATCH,
  });

  for (const r of due) {
    let outcome: DispatchOutcome;
    try {
      outcome = await dispatchOne(r, config, now);
    } catch (e) {
      console.error(`[reminders] Error procesando recordatorio ${r.id}:`, e);
      outcome = "failed";
    }
    switch (outcome) {
      case "sent":
        summary.sentEmail++;
        break;
      case "manual":
        summary.manualPending++;
        break;
      case "failed":
        summary.failed++;
        break;
      case "optOut":
        summary.skippedOptOut++;
        break;
      case "noContact":
        summary.skippedNoContact++;
        break;
      default:
        break; // invalidated / deferred / busy: mantenimiento, no se cuentan
    }
  }
  return summary;
}

/** plan + dispatch (cron, botón "Enviar" de recepción, script). */
export async function runReminderCycle(now: Date = new Date()): Promise<ReminderDispatchSummary> {
  const planned = await planReminders(now);
  const dispatched = await dispatchDue(now);
  return {
    planned: planned.planned,
    sentEmail: dispatched.sentEmail,
    manualPending: dispatched.manualPending,
    failed: dispatched.failed,
    skippedOptOut: planned.skippedOptOut + dispatched.skippedOptOut,
    skippedNoContact: planned.skippedNoContact + dispatched.skippedNoContact,
  };
}

// ─── Vista para recepción ────────────────────────────────────────────────────

/** Include estándar para armar ReminderItem desde una fila de ShiftReminder. */
export const REMINDER_ITEM_INCLUDE = {
  shift: {
    select: {
      id: true,
      start: true,
      status: true,
      patient: { select: { firstName: true, lastName: true, telephone: true } },
      user: {
        select: {
          firstName: true,
          lastName: true,
          name: true,
          specialization: { select: { color: true } },
        },
      },
    },
  },
} satisfies Prisma.ShiftReminderInclude;

export type ReminderItemRow = Prisma.ShiftReminderGetPayload<{ include: typeof REMINDER_ITEM_INCLUDE }>;

export interface ReminderRowFields {
  id: string;
  shiftId: string;
  status: ReminderStatus;
  channel: string;
  offsetHours: number;
  manual: boolean;
  deliveredTo: string | null;
  tokenHash: string | null;
  tokenExpiresAt: Date | null;
  response: string | null;
  respondedAt: Date | null;
  errorMessage: string | null;
}

/**
 * ShiftReminder → ReminderItem. Para los manuales PENDING de WhatsApp calcula
 * el waLink con el mensaje prellenado y el link de confirmación (ensureToken
 * persiste el hash; el token es estable, así que recalcularlo en cada polling
 * no invalida el link ya enviado).
 */
export async function reminderToItem(
  reminder: ReminderRowFields,
  shift: { start: Date },
  patient: { firstName: string; lastName: string; telephone?: string | null } | null,
  medic: (MedicNameInfo & { specialization?: { color: string | null } | null }) | null,
  config: ReminderConfig,
  now: Date = new Date(),
): Promise<ReminderItem> {
  const channel = asChannel(reminder.channel);
  let waLink: string | null = null;

  if (
    reminder.manual &&
    reminder.status === "PENDING" &&
    channel === "WHATSAPP" &&
    shift.start.getTime() > now.getTime()
  ) {
    const phone = reminder.deliveredTo ?? patient?.telephone ?? null;
    if (toWhatsappDigits(phone)) {
      const token = await ensureToken(reminder.id, {
        currentHash: reminder.tokenHash,
        currentExpiresAt: reminder.tokenExpiresAt,
        expiresAt: shift.start,
      });
      const text = renderReminderText({
        patientFirstName: firstGivenName(patient?.firstName),
        start: shift.start,
        medicShortName: medicShortName(medic),
        clinicName: config.clinicName,
        address: config.address,
        confirmationLink: confirmationUrl(token),
        template: config.reminderTemplate,
      });
      waLink = whatsappLink(phone, text);
    }
  }

  return {
    id: reminder.id,
    shiftId: reminder.shiftId,
    time: formatReminderTime(shift.start),
    patientShortName: patientShortName(patient),
    medicShortName: medicShortName(medic),
    medicColor: medic?.specialization?.color ?? null,
    status: reminder.status,
    channel,
    offsetHours: reminder.offsetHours,
    manual: reminder.manual,
    waLink,
    deliveredTo: reminder.deliveredTo,
    response: asResponse(reminder.response),
    respondedAt: reminder.respondedAt ? reminder.respondedAt.toISOString() : null,
    errorMessage: reminder.errorMessage,
  };
}

export function reminderRowToItem(
  row: ReminderItemRow,
  config: ReminderConfig,
  now: Date = new Date(),
): Promise<ReminderItem> {
  return reminderToItem(row, row.shift, row.shift.patient, row.shift.user, config, now);
}

// ─── Fechas (zona Argentina) ─────────────────────────────────────────────────
// Argentina no tiene horario de verano desde 2009: UTC-3 fijo.

const AR_TZ = "America/Argentina/Buenos_Aires";
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" de la fecha en hora argentina. */
export function arDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Rango [00:00, 24:00) de un día argentino. null si la fecha no es válida. */
export function arDayRange(dateKey: string): { start: Date; end: Date } | null {
  if (!DATE_KEY_RE.test(dateKey)) return null;
  const start = new Date(`${dateKey}T00:00:00-03:00`);
  if (Number.isNaN(start.getTime())) return null;
  // Rechaza fechas que JS "corrige" (2026-02-31 → 03-03)
  if (arDateKey(start) !== dateKey) return null;
  return { start, end: new Date(start.getTime() + 24 * HOUR_MS) };
}

/** Fecha de mañana (hora argentina) como "YYYY-MM-DD". */
export function arTomorrowKey(now: Date = new Date()): string {
  const todayStart = new Date(`${arDateKey(now)}T00:00:00-03:00`);
  return arDateKey(new Date(todayStart.getTime() + 24 * HOUR_MS));
}
