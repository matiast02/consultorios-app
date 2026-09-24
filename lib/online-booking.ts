// Reservas online de turnos (contrato: contracts/api-schemas/online-booking.yaml).
//
// Flujo: el paciente pide un horario libre desde /reservar sin cuenta → se crea
// un Shift PENDING (source ONLINE) + OnlineBookingRequest con lo que cargó →
// recepción confirma o rechaza; el paciente puede ver / cancelar desde el link
// /reserva/<token> (token aleatorio, solo el hash en DB, vence con el turno).
//
// Privacidad / minimización:
//   - Si el DNI ya existe, el turno se vincula al Patient existente SIN leer
//     hacia afuera ni modificar sus datos; lo cargado queda en la request para
//     que recepción verifique (`patientDataMismatch`).
//   - Las vistas públicas solo usan lo que cargó el propio solicitante.
//   - Nada clínico: no hay motivo de consulta; `observations` es una nota
//     administrativa fija.
//
// Concurrencia: la creación corre en una transacción READ COMMITTED que primero
// toma `SELECT … FOR UPDATE` sobre la fila del médico (mutex por profesional
// entre reservas online) y recién después re-calcula los huecos con
// getAvailableSlots(db: tx). Si dos pacientes piden el mismo horario, el
// segundo espera el lock, ve el turno del primero y recibe 409 SLOT_TAKEN.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addDaysToKey,
  arDateKey,
  arTimeLabel,
  getAvailableSlots,
  isValidDateKey,
  loadDayAvailability,
  loadRangeAvailability,
  type AvailabilityDb,
} from "@/lib/availability";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/email";
import { formatReminderDate, formatReminderTime } from "@/lib/reminders/message";
import { firstGivenName, formatClinicAddress, medicShortName } from "@/lib/reminders/scheduler";
import { generateConfirmationToken, hashConfirmationToken } from "@/lib/reminders/tokens";
import type { PublicBookingCreateParsed } from "@/lib/validations";
import type {
  OnlineBookingStaffItem,
  OnlineBookingStatus,
  PublicAvailabilityDay,
  PublicBookingConfig,
  PublicBookingCreated,
  PublicBookingSpecialty,
  PublicBookingView,
  SecretaryOnlineBookingsData,
} from "@/types";

const MINUTE_MS = 60_000;

/** Máximo de reservas online pendientes (a futuro) por DNI. */
export const MAX_PENDING_PER_DNI = 3;
export const ONLINE_SHIFT_OBSERVATIONS = "Reserva online · verificar datos con el paciente";
export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_VARCHAR = 191;

// ─── Errores ─────────────────────────────────────────────────────────────────

export type OnlineBookingErrorCode =
  | "DISABLED" // 503
  | "NOT_FOUND" // 404
  | "INVALID_INPUT" // 400
  | "MEDIC_UNAVAILABLE" // 422
  | "OUT_OF_WINDOW" // 422
  | "NOT_A_SLOT" // 422
  | "SLOT_TAKEN" // 409
  | "TOO_MANY_PENDING" // 409
  | "INVALID_STATE"; // 409

export class OnlineBookingError extends Error {
  constructor(
    readonly code: OnlineBookingErrorCode,
    readonly status: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "OnlineBookingError";
  }
}

const disabled = () =>
  new OnlineBookingError("DISABLED", 503, "Las reservas online no están disponibles en este momento.");

// ─── Configuración ───────────────────────────────────────────────────────────

export interface OnlineBookingRuntimeSettings {
  enabled: boolean;
  minAdvanceHours: number;
  maxDaysAhead: number;
  notes: string | null;
  clinicName: string | null;
  address: string | null;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

export async function loadOnlineBookingSettings(): Promise<OnlineBookingRuntimeSettings> {
  const row = await prisma.clinicSettings.findUnique({
    where: { id: "default" },
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      onlineBookingEnabled: true,
      onlineBookingMinAdvanceHours: true,
      onlineBookingMaxDaysAhead: true,
      onlineBookingNotes: true,
    },
  });
  return {
    enabled: row?.onlineBookingEnabled === true,
    minAdvanceHours: clampInt(row?.onlineBookingMinAdvanceHours, 0, 168, 2),
    maxDaysAhead: clampInt(row?.onlineBookingMaxDaysAhead, 1, 180, 30),
    notes: row?.onlineBookingNotes?.trim() || null,
    clinicName: row?.name?.trim() || null,
    address: formatClinicAddress(row?.addressLine1, row?.addressLine2),
  };
}

// ─── Profesionales públicos ──────────────────────────────────────────────────

const PUBLIC_MEDIC_WHERE = {
  isActive: true,
  deletedAt: null,
  acceptsOnlineBooking: true,
  roles: { some: { role: { name: "medic" } } },
} satisfies Prisma.UserWhereInput;

const PUBLIC_MEDIC_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  name: true,
  slotDurationMinutes: true,
  bufferMinutes: true,
  minAdvanceMinutes: true,
  notifyNewShift: true,
  notifyCancellation: true,
  specialization: { select: { id: true, name: true, color: true } },
} satisfies Prisma.UserSelect;

async function findPublicMedic(db: AvailabilityDb, medicId: string) {
  return db.user.findFirst({ where: { id: medicId, ...PUBLIC_MEDIC_WHERE }, select: PUBLIC_MEDIC_SELECT });
}

const NO_SPECIALTY_ID = "sin-especialidad";

export async function getPublicBookingConfig(): Promise<PublicBookingConfig> {
  const settings = await loadOnlineBookingSettings();
  const config: PublicBookingConfig = {
    enabled: settings.enabled,
    clinicName: settings.clinicName,
    notes: settings.notes,
    minAdvanceHours: settings.minAdvanceHours,
    maxDaysAhead: settings.maxDaysAhead,
    consultationTypes: [],
    specialties: [],
  };
  // Deshabilitado: no se expone la lista de profesionales.
  if (!settings.enabled) return config;

  const [types, medics] = await Promise.all([
    prisma.consultationType.findMany({
      select: { id: true, name: true, durationMinutes: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      // Solo quien tiene al menos un día de atención configurado.
      where: { ...PUBLIC_MEDIC_WHERE, preferences: { some: {} } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        slotDurationMinutes: true,
        specialization: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const groups = new Map<string, PublicBookingSpecialty>();
  for (const m of medics) {
    const spec = m.specialization;
    const key = spec?.id ?? NO_SPECIALTY_ID;
    let group = groups.get(key);
    if (!group) {
      group = spec
        ? { id: spec.id, name: spec.name, color: spec.color ?? null, medics: [] }
        : { id: NO_SPECIALTY_ID, name: "Otros profesionales", color: null, medics: [] };
      groups.set(key, group);
    }
    group.medics.push({ id: m.id, shortName: medicShortName(m), slotDurationMinutes: m.slotDurationMinutes });
  }

  config.consultationTypes = types;
  config.specialties = [...groups.values()].sort((a, b) => {
    if (a.id === NO_SPECIALTY_ID) return 1;
    if (b.id === NO_SPECIALTY_ID) return -1;
    return a.name.localeCompare(b.name, "es");
  });
  return config;
}

// ─── Disponibilidad pública ──────────────────────────────────────────────────

async function resolveDuration(
  db: AvailabilityDb,
  consultationTypeId: string | null | undefined,
  fallbackMinutes: number,
): Promise<{ durationMinutes: number; consultationTypeId: string | null }> {
  if (!consultationTypeId) return { durationMinutes: fallbackMinutes, consultationTypeId: null };
  const type = await db.consultationType.findUnique({
    where: { id: consultationTypeId },
    select: { id: true, durationMinutes: true },
  });
  if (!type) throw new OnlineBookingError("INVALID_INPUT", 400, "Tipo de consulta inválido");
  return { durationMinutes: type.durationMinutes, consultationTypeId: type.id };
}

export interface PublicAvailabilityResult {
  medicId: string;
  durationMinutes: number;
  days: PublicAvailabilityDay[];
}

export async function getPublicAvailability(
  medicId: string,
  from: string | null | undefined,
  days: number,
  consultationTypeId?: string | null,
  now: Date = new Date(),
): Promise<PublicAvailabilityResult> {
  const settings = await loadOnlineBookingSettings();
  if (!settings.enabled) throw disabled();

  const medic = await findPublicMedic(prisma, medicId);
  if (!medic) throw new OnlineBookingError("NOT_FOUND", 404, "Profesional no disponible para reservas online");

  const today = arDateKey(now);
  const fromKey = from ?? today;
  if (!isValidDateKey(fromKey)) throw new OnlineBookingError("INVALID_INPUT", 400, "Fecha inválida");
  const count = Math.min(14, Math.max(1, Math.floor(days)));
  const { durationMinutes } = await resolveDuration(prisma, consultationTypeId, medic.slotDurationMinutes);

  const lastKey = addDaysToKey(today, settings.maxDaysAhead);
  const advanceMinutes = Math.max(0, medic.minAdvanceMinutes, settings.minAdvanceHours * 60);
  const range = await loadRangeAvailability({
    medicId,
    from: fromKey,
    days: count,
    durationMinutes,
    bufferMinutes: medic.bufferMinutes,
    notBefore: new Date(now.getTime() + advanceMinutes * MINUTE_MS),
  });

  return {
    medicId,
    durationMinutes,
    days: range.map((d) => {
      // Fuera de la ventana [hoy, hoy + maxDaysAhead] o sin atención → cerrado.
      if (d.date < today || d.date > lastKey || d.status !== "OPEN") {
        return { date: d.date, closed: true, slots: [] };
      }
      return {
        date: d.date,
        closed: false,
        slots: d.slots
          .filter((s) => s.available)
          .map((s) => ({ start: s.start.toISOString(), time: arTimeLabel(s.start) })),
      };
    }),
  };
}

// ─── Estado efectivo ─────────────────────────────────────────────────────────
// La request guarda lo que decidieron recepción / el paciente por esta vía; el
// turno puede cambiar por otras (agenda, link del recordatorio). Se deriva:
//   PENDING/CONFIRMED + turno cancelado → CANCELLED
//   PENDING + turno ya empezado          → EXPIRED

interface ShiftState {
  status: string;
  start: Date;
}

export function effectiveStatus(status: OnlineBookingStatus, shift: ShiftState, now: Date): OnlineBookingStatus {
  if ((status === "PENDING_CONFIRMATION" || status === "CONFIRMED") && shift.status === "CANCELLED") return "CANCELLED";
  if (status === "PENDING_CONFIRMATION" && shift.start.getTime() <= now.getTime()) return "EXPIRED";
  return status;
}

function canPatientCancel(status: OnlineBookingStatus, shift: ShiftState, now: Date): boolean {
  return (
    (status === "PENDING_CONFIRMATION" || status === "CONFIRMED") &&
    (shift.status === "PENDING" || shift.status === "CONFIRMED") &&
    shift.start.getTime() > now.getTime()
  );
}

function whereEffectiveStatus(status: OnlineBookingStatus, now: Date): Prisma.OnlineBookingRequestWhereInput {
  switch (status) {
    case "PENDING_CONFIRMATION":
      return { status: "PENDING_CONFIRMATION", shift: { status: { not: "CANCELLED" }, start: { gt: now } } };
    case "CONFIRMED":
      return { status: "CONFIRMED", shift: { status: { not: "CANCELLED" } } };
    case "CANCELLED":
      return {
        OR: [
          { status: "CANCELLED" },
          { status: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] }, shift: { status: "CANCELLED" } },
        ],
      };
    case "EXPIRED":
      return {
        OR: [
          { status: "EXPIRED" },
          { status: "PENDING_CONFIRMATION", shift: { status: { not: "CANCELLED" }, start: { lte: now } } },
        ],
      };
  }
}

// ─── Comparación de nombres ──────────────────────────────────────────────────

function nameTokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shareToken(a: string | null | undefined, b: string | null | undefined): boolean {
  const tb = new Set(nameTokens(b));
  return nameTokens(a).some((t) => tb.has(t));
}

/**
 * true si lo cargado no coincide con el paciente existente. Sin acentos ni
 * mayúsculas y tolerante a nombres compuestos: alcanza con que nombre y
 * apellido compartan al menos una palabra ("Maria" ~ "María José").
 */
export function namesMismatch(
  requester: { firstName: string; lastName: string },
  patient: { firstName: string | null; lastName: string | null },
): boolean {
  return !(shareToken(requester.firstName, patient.firstName) && shareToken(requester.lastName, patient.lastName));
}

// ─── Link de gestión ─────────────────────────────────────────────────────────

export function bookingManagePath(token: string): string {
  return `/reserva/${token}`;
}

function absoluteUrl(path: string): string {
  const base =
    process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function bookingEmail(p: {
  firstName: string;
  start: Date;
  medicShortName: string;
  clinicName: string | null;
  address: string | null;
  link: string;
}) {
  const fecha = formatReminderDate(p.start);
  const hora = formatReminderTime(p.start);
  const lines = [
    `Hola ${firstGivenName(p.firstName)},`,
    "",
    `Recibimos tu pedido de turno para el ${fecha} a las ${hora} con ${p.medicShortName}${
      p.clinicName ? ` en ${p.clinicName}` : ""
    }.`,
    ...(p.address ? [`Dirección: ${p.address}`] : []),
    "",
    "Todavía no está confirmado: recepción se va a comunicar con vos para confirmarlo.",
    `Podés ver el estado o cancelarlo desde este link: ${p.link}`,
    "",
    "Si no pediste este turno, podés cancelarlo desde el mismo link.",
  ];
  const text = lines.join("\n");
  const html =
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">` +
    escapeHtml(text).replace(/\n/g, "<br>") +
    `<p style="margin-top:16px"><a href="${escapeHtml(p.link)}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Ver o cancelar mi reserva</a></p></div>`;
  return {
    subject: `Pedido de turno recibido · ${fecha} ${hora}${p.clinicName ? ` · ${p.clinicName}` : ""}`,
    text,
    html,
  };
}

// ─── Notificaciones internas ─────────────────────────────────────────────────

async function notifyStaffAndMedic(n: {
  type: string;
  title: string;
  message: string;
  staffResourceId: string;
  medicId: string;
  medicResourceId: string;
  notifyMedic: boolean;
}): Promise<void> {
  try {
    const staff = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        roles: { some: { role: { name: { in: ["secretary", "admin"] } } } },
      },
      select: { id: true },
    });
    const rows = staff.map((u) => ({
      userId: u.id,
      type: n.type,
      title: n.title,
      message: n.message,
      resourceId: n.staffResourceId,
    }));
    if (n.notifyMedic && !staff.some((u) => u.id === n.medicId)) {
      rows.push({ userId: n.medicId, type: n.type, title: n.title, message: n.message, resourceId: n.medicResourceId });
    }
    if (rows.length > 0) await prisma.notification.createMany({ data: rows });
  } catch (e) {
    console.error("[online-booking] No se pudieron crear las notificaciones:", e);
  }
}

// ─── Creación ────────────────────────────────────────────────────────────────

export interface BookingRequestMeta {
  ip: string | null;
  userAgent: string | null;
}

interface CreatedInTx {
  requestId: string;
  shiftId: string;
  patientId: string;
  token: string;
  createdPatient: boolean;
  /** Para recepción (nunca sale en la respuesta pública). */
  verifyHint: string | null;
  medic: { id: string; shortName: string; notifyNewShift: boolean };
}

function isRetryableTxError(e: unknown): boolean {
  // P2002: carrera en Patient.dni (dos altas del mismo DNI); P2034: deadlock / conflicto de escritura.
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034");
}

async function createInTx(
  tx: AvailabilityDb,
  input: PublicBookingCreateParsed,
  settings: OnlineBookingRuntimeSettings,
  meta: BookingRequestMeta,
  now: Date,
): Promise<CreatedInTx> {
  // 1) Mutex por profesional: serializa las reservas online del mismo médico
  //    hasta el commit, así el re-chequeo de huecos ve los turnos recién creados.
  await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${input.medicId} FOR UPDATE`;

  const medic = await findPublicMedic(tx, input.medicId);
  if (!medic) {
    throw new OnlineBookingError("MEDIC_UNAVAILABLE", 422, "El profesional elegido no toma reservas online.");
  }
  const { durationMinutes, consultationTypeId } = await resolveDuration(
    tx,
    input.consultationTypeId,
    medic.slotDurationMinutes,
  );

  // 2) Ventana: anticipación mínima (la mayor entre la del médico y la del consultorio) y días máximos.
  const start = new Date(input.start);
  const dateKey = arDateKey(start);
  const lastKey = addDaysToKey(arDateKey(now), settings.maxDaysAhead);
  const onlineAdvance = settings.minAdvanceHours * 60;
  const advanceMinutes = Math.max(0, medic.minAdvanceMinutes, onlineAdvance);
  if (dateKey > lastKey || start.getTime() <= now.getTime() + advanceMinutes * MINUTE_MS) {
    throw new OnlineBookingError(
      "OUT_OF_WINDOW",
      422,
      "Ese horario está fuera del período habilitado para reservar online. Elegí otro de los disponibles.",
    );
  }

  // 3) Anti-abuso: reservas online pendientes (a futuro) con el mismo DNI.
  const pending = await tx.onlineBookingRequest.count({
    where: {
      requesterDni: input.dni,
      status: "PENDING_CONFIRMATION",
      shift: { status: { not: "CANCELLED" }, start: { gt: now } },
    },
  });
  if (pending >= MAX_PENDING_PER_DNI) {
    throw new OnlineBookingError(
      "TOO_MANY_PENDING",
      409,
      "Ya hay varias reservas pendientes de confirmar con ese DNI. Esperá la confirmación o cancelá alguna antes de pedir otra.",
    );
  }

  // 4) Re-chequeo del hueco dentro de la transacción (con el lock tomado).
  const free = await getAvailableSlots({
    medicId: medic.id,
    date: dateKey,
    durationMinutes,
    now,
    minAdvanceMinutes: onlineAdvance,
    db: tx,
  });
  if (!free.some((s) => s.start.getTime() === start.getTime())) {
    // ¿Existe en la grilla del profesional (ocupado) o directamente no es un horario válido?
    const grid = await loadDayAvailability({
      medicId: medic.id,
      date: dateKey,
      durationMinutes,
      bufferMinutes: medic.bufferMinutes,
      notBefore: new Date(now.getTime() + advanceMinutes * MINUTE_MS),
      db: tx,
    });
    if (grid.slots.some((s) => s.start.getTime() === start.getTime())) {
      throw new OnlineBookingError("SLOT_TAKEN", 409, "Ese horario se acaba de ocupar. Elegí otro, por favor.");
    }
    throw new OnlineBookingError(
      "NOT_A_SLOT",
      422,
      "Ese horario no está dentro de la agenda del profesional. Elegí otro de los disponibles.",
    );
  }

  // 5) Paciente: vincular por DNI sin modificar, o alta mínima.
  const byDni = await tx.patient.findUnique({
    where: { dni: input.dni },
    select: { id: true, firstName: true, lastName: true, deletedAt: true },
  });
  let patientId: string;
  let createdPatient = false;
  let verifyHint: string | null = null;
  if (byDni && !byDni.deletedAt) {
    patientId = byDni.id;
    if (namesMismatch(input, byDni)) {
      verifyHint = "El DNI ya estaba registrado con otro nombre: verificá los datos antes de confirmar.";
    }
  } else {
    // Si el DNI lo ocupa un paciente archivado (dni es @unique), el alta va sin
    // DNI: lo cargado queda en la request y recepción resuelve (no se revela nada).
    const created = await tx.patient.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        dni: byDni ? null : input.dni,
        telephone: input.phone,
        email: input.email,
        createdById: null,
        // El consentimiento informado lo registra recepción; acá solo privacyAcceptedAt en la request.
        consentType: null,
      },
      select: { id: true },
    });
    patientId = created.id;
    createdPatient = true;
    if (byDni) {
      verifyHint = "El DNI corresponde a un paciente archivado: se creó una ficha nueva sin DNI, verificá antes de confirmar.";
    }
  }

  // 6) Turno + request con token de gestión (vence con el turno).
  const shift = await tx.shift.create({
    data: {
      userId: medic.id,
      patientId,
      start,
      end: new Date(start.getTime() + durationMinutes * MINUTE_MS),
      status: "PENDING",
      source: "ONLINE",
      observations: ONLINE_SHIFT_OBSERVATIONS,
      consultationTypeId,
    },
    select: { id: true },
  });

  const { token, hash } = generateConfirmationToken();
  const request = await tx.onlineBookingRequest.create({
    data: {
      shiftId: shift.id,
      patientId,
      status: "PENDING_CONFIRMATION",
      requesterFirstName: input.firstName,
      requesterLastName: input.lastName,
      requesterDni: input.dni,
      requesterPhone: input.phone,
      requesterEmail: input.email,
      healthInsuranceText: input.healthInsurance,
      consultationTypeId,
      matchedExisting: !createdPatient,
      tokenHash: hash,
      tokenExpiresAt: start,
      privacyAcceptedAt: now,
      ipAddress: meta.ip ? meta.ip.slice(0, MAX_VARCHAR) : null,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 500) : null,
    },
    select: { id: true },
  });

  return {
    requestId: request.id,
    shiftId: shift.id,
    patientId,
    token,
    createdPatient,
    verifyHint,
    medic: { id: medic.id, shortName: medicShortName(medic), notifyNewShift: medic.notifyNewShift },
  };
}

export interface CreateOnlineBookingResult {
  created: PublicBookingCreated;
  shiftId: string;
  patientId: string;
  createdPatient: boolean;
}

export async function createOnlineBooking(
  input: PublicBookingCreateParsed,
  meta: BookingRequestMeta,
  opts: { now?: Date; settings?: OnlineBookingRuntimeSettings } = {},
): Promise<CreateOnlineBookingResult> {
  const now = opts.now ?? new Date();
  const settings = opts.settings ?? (await loadOnlineBookingSettings());
  if (!settings.enabled) throw disabled();

  const runTx = () =>
    prisma.$transaction((tx) => createInTx(tx, input, settings, meta, now), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 10_000,
    });

  let result: CreatedInTx;
  try {
    result = await runTx();
  } catch (e) {
    if (!isRetryableTxError(e)) throw e;
    // Un reintento: si otra alta ganó la carrera por el DNI, ahora se vincula a esa ficha.
    try {
      result = await runTx();
    } catch (e2) {
      if (isRetryableTxError(e2)) {
        throw new OnlineBookingError("SLOT_TAKEN", 409, "Ese horario se acaba de ocupar. Elegí otro, por favor.");
      }
      throw e2;
    }
  }

  const start = new Date(input.start);
  const fecha = formatReminderDate(start);
  const hora = formatReminderTime(start);

  // Aviso interno (sin datos clínicos). No bloquea la reserva si falla.
  await notifyStaffAndMedic({
    type: "online_booking",
    title: "Nueva reserva online",
    message: `${input.lastName}, ${firstGivenName(input.firstName)} pidió turno online con ${result.medic.shortName} el ${fecha} a las ${hora}. Falta confirmarlo.${
      result.verifyHint ? ` ${result.verifyHint}` : ""
    }`,
    staffResourceId: result.requestId,
    medicId: result.medic.id,
    medicResourceId: result.shiftId,
    notifyMedic: result.medic.notifyNewShift,
  });

  // Email con el link de gestión (solo si hay proveedor real configurado).
  let emailSent = false;
  if (input.email && isEmailConfigured()) {
    try {
      const mail = bookingEmail({
        firstName: input.firstName,
        start,
        medicShortName: result.medic.shortName,
        clinicName: settings.clinicName,
        address: settings.address,
        link: absoluteUrl(bookingManagePath(result.token)),
      });
      const sent = await sendEmail({ to: input.email, ...mail });
      if (sent.ok) {
        emailSent = true;
        await prisma.onlineBookingRequest.update({
          where: { id: result.requestId },
          data: { emailSentAt: new Date() },
        });
      } else {
        console.error("[online-booking] Email no enviado:", sent.error);
      }
    } catch (e) {
      console.error("[online-booking] Error al enviar el email:", e);
    }
  }

  return {
    shiftId: result.shiftId,
    patientId: result.patientId,
    createdPatient: result.createdPatient,
    created: {
      requestId: result.requestId,
      status: "PENDING_CONFIRMATION",
      start: start.toISOString(),
      medicShortName: result.medic.shortName,
      manageUrl: bookingManagePath(result.token),
      emailSent,
      message: emailSent
        ? "Recibimos tu pedido de turno. Recepción se va a comunicar para confirmarlo. Te enviamos por email el link para ver el estado o cancelarlo."
        : "Recibimos tu pedido de turno. Recepción se va a comunicar para confirmarlo. Guardá este link para ver el estado o cancelarlo.",
    },
  };
}

// ─── Link público (/reserva/<token>) ─────────────────────────────────────────

const TOKEN_ROW_SELECT = {
  id: true,
  status: true,
  requesterFirstName: true,
  requesterLastName: true,
  tokenExpiresAt: true,
  shiftId: true,
  shift: {
    select: {
      id: true,
      start: true,
      status: true,
      userId: true,
      user: { select: { firstName: true, lastName: true, name: true, notifyCancellation: true } },
      consultationType: { select: { name: true } },
    },
  },
  patient: { select: { deletedAt: true } },
} satisfies Prisma.OnlineBookingRequestSelect;

type TokenRow = Prisma.OnlineBookingRequestGetPayload<{ select: typeof TOKEN_ROW_SELECT }>;

async function findByToken(token: string, now: Date): Promise<TokenRow | null> {
  if (!MANAGE_TOKEN_RE.test(token)) return null;
  const row = await prisma.onlineBookingRequest.findUnique({
    where: { tokenHash: hashConfirmationToken(token) },
    select: TOKEN_ROW_SELECT,
  });
  if (!row?.shift) return null;
  if (row.tokenExpiresAt.getTime() <= now.getTime()) return null;
  if (row.patient?.deletedAt) return null;
  return row;
}

function toPublicView(
  row: TokenRow,
  settings: Pick<OnlineBookingRuntimeSettings, "clinicName" | "address">,
  now: Date,
  override?: { status: OnlineBookingStatus; shiftStatus: string },
): PublicBookingView {
  const shift = override ? { ...row.shift, status: override.shiftStatus } : row.shift;
  const status = override?.status ?? effectiveStatus(row.status, shift, now);
  return {
    status,
    clinicName: settings.clinicName,
    address: settings.address,
    // Solo lo que cargó el solicitante (nunca datos del Patient vinculado).
    patientFirstName: firstGivenName(row.requesterFirstName),
    start: shift.start.toISOString(),
    medicShortName: medicShortName(shift.user),
    consultationTypeName: shift.consultationType?.name ?? null,
    canCancel: canPatientCancel(status, shift, now),
  };
}

export async function getBookingByToken(token: string, now: Date = new Date()): Promise<PublicBookingView | null> {
  const row = await findByToken(token, now);
  if (!row) return null;
  const settings = await loadOnlineBookingSettings();
  return toPublicView(row, settings, now);
}

export async function cancelByPatient(
  token: string,
  now: Date = new Date(),
): Promise<{ view: PublicBookingView; shiftId: string }> {
  const row = await findByToken(token, now);
  if (!row) throw new OnlineBookingError("NOT_FOUND", 404, "El link no es válido o ya venció");
  const settings = await loadOnlineBookingSettings();

  const conflict = () =>
    new OnlineBookingError(
      "INVALID_STATE",
      409,
      "Esta reserva ya no se puede cancelar desde el link. Si necesitás ayuda, comunicate con el consultorio.",
      toPublicView(row, settings, now),
    );

  const status = effectiveStatus(row.status, row.shift, now);
  if (!canPatientCancel(status, row.shift, now)) throw conflict();

  const ok = await prisma.$transaction(async (tx) => {
    // Condicional: si recepción lo canceló / finalizó entre la lectura y la escritura → 409.
    const shiftUpd = await tx.shift.updateMany({
      where: { id: row.shiftId, status: { in: ["PENDING", "CONFIRMED"] }, start: { gt: now } },
      data: { status: "CANCELLED" },
    });
    if (shiftUpd.count === 0) return false;
    const reqUpd = await tx.onlineBookingRequest.updateMany({
      where: { id: row.id, status: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] } },
      data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "PATIENT" },
    });
    if (reqUpd.count === 0) throw conflict(); // revierte la cancelación del turno
    await tx.shiftReminder.updateMany({
      where: { shiftId: row.shiftId, status: "PENDING" },
      data: { status: "FAILED", errorMessage: "Turno cancelado por el paciente (reserva online)" },
    });
    return true;
  });
  if (!ok) throw conflict();

  await notifyStaffAndMedic({
    type: "online_booking_cancelled",
    title: "Reserva online cancelada por el paciente",
    message: `${row.requesterLastName}, ${firstGivenName(row.requesterFirstName)} canceló su reserva online del ${formatReminderDate(
      row.shift.start,
    )} a las ${formatReminderTime(row.shift.start)} con ${medicShortName(row.shift.user)}.`,
    staffResourceId: row.id,
    medicId: row.shift.userId,
    medicResourceId: row.shiftId,
    notifyMedic: row.shift.user.notifyCancellation,
  });

  return {
    view: toPublicView(row, settings, now, { status: "CANCELLED", shiftStatus: "CANCELLED" }),
    shiftId: row.shiftId,
  };
}

// ─── Recepción ───────────────────────────────────────────────────────────────

const STAFF_ITEM_SELECT = {
  id: true,
  shiftId: true,
  patientId: true,
  status: true,
  createdAt: true,
  requesterFirstName: true,
  requesterLastName: true,
  requesterDni: true,
  requesterPhone: true,
  requesterEmail: true,
  healthInsuranceText: true,
  matchedExisting: true,
  shift: {
    select: {
      start: true,
      status: true,
      user: { select: { firstName: true, lastName: true, name: true, specialization: { select: { color: true } } } },
      consultationType: { select: { name: true } },
    },
  },
  patient: { select: { firstName: true, lastName: true, dni: true } },
} satisfies Prisma.OnlineBookingRequestSelect;

type StaffRow = Prisma.OnlineBookingRequestGetPayload<{ select: typeof STAFF_ITEM_SELECT }>;

function toStaffItem(r: StaffRow, now: Date): OnlineBookingStaffItem {
  const requester = { firstName: r.requesterFirstName, lastName: r.requesterLastName };
  return {
    id: r.id,
    shiftId: r.shiftId,
    status: effectiveStatus(r.status, r.shift, now),
    createdAt: r.createdAt.toISOString(),
    start: r.shift.start.toISOString(),
    medicShortName: medicShortName(r.shift.user),
    medicColor: r.shift.user.specialization?.color ?? null,
    consultationTypeName: r.shift.consultationType?.name ?? null,
    requester: {
      firstName: r.requesterFirstName,
      lastName: r.requesterLastName,
      dni: r.requesterDni,
      phone: r.requesterPhone,
      email: r.requesterEmail,
      healthInsuranceText: r.healthInsuranceText,
    },
    patientId: r.patientId,
    matchedExisting: r.matchedExisting,
    // Existente: nombre distinto. Nuevo: la ficha quedó sin ese DNI (colisión con un archivado).
    patientDataMismatch: r.matchedExisting
      ? namesMismatch(requester, r.patient)
      : r.patient.dni !== r.requesterDni,
  };
}

export async function listForStaff(
  status?: OnlineBookingStatus | null,
  now: Date = new Date(),
): Promise<OnlineBookingStaffItem[]> {
  const rows = await prisma.onlineBookingRequest.findMany({
    where: status ? whereEffectiveStatus(status, now) : {},
    select: STAFF_ITEM_SELECT,
    // Pendientes: las más antiguas primero (a confirmar); el resto, lo más reciente primero.
    orderBy: { createdAt: status === "PENDING_CONFIRMATION" ? "asc" : "desc" },
    take: 200,
  });
  return rows.map((r) => toStaffItem(r, now));
}

export async function staffSummary(now: Date = new Date()): Promise<SecretaryOnlineBookingsData> {
  const where = whereEffectiveStatus("PENDING_CONFIRMATION", now);
  const [pending, rows] = await Promise.all([
    prisma.onlineBookingRequest.count({ where }),
    prisma.onlineBookingRequest.findMany({
      where,
      select: STAFF_ITEM_SELECT,
      orderBy: { createdAt: "asc" },
      take: 5,
    }),
  ]);
  return { pending, items: rows.map((r) => toStaffItem(r, now)) };
}

async function loadStaffItem(id: string, now: Date): Promise<OnlineBookingStaffItem> {
  const row = await prisma.onlineBookingRequest.findUnique({ where: { id }, select: STAFF_ITEM_SELECT });
  if (!row) throw new OnlineBookingError("NOT_FOUND", 404, "Reserva no encontrada");
  return toStaffItem(row, now);
}

const staffConflict = (msg: string) => new OnlineBookingError("INVALID_STATE", 409, msg);

/** Recepción confirma: Shift CONFIRMED (confirmedVia STAFF) + request CONFIRMED. */
export async function confirmByStaff(id: string, userId: string, now: Date = new Date()): Promise<OnlineBookingStaffItem> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.onlineBookingRequest.findUnique({
      where: { id },
      select: { id: true, status: true, shiftId: true, shift: { select: { status: true, start: true } } },
    });
    if (!row) throw new OnlineBookingError("NOT_FOUND", 404, "Reserva no encontrada");
    if (effectiveStatus(row.status, row.shift, now) !== "PENDING_CONFIRMATION") {
      throw staffConflict("La reserva ya no está pendiente de confirmación");
    }
    // Si el paciente ya lo confirmó desde el link del recordatorio, el turno queda como está.
    if (row.shift.status === "PENDING") {
      const upd = await tx.shift.updateMany({
        where: { id: row.shiftId, status: "PENDING", start: { gt: now } },
        data: { status: "CONFIRMED", confirmedAt: now, confirmedVia: "STAFF" },
      });
      if (upd.count === 0) throw staffConflict("El turno cambió mientras se confirmaba; actualizá la lista");
    } else if (row.shift.status !== "CONFIRMED") {
      throw staffConflict("El turno ya no admite confirmación");
    }
    const reqUpd = await tx.onlineBookingRequest.updateMany({
      where: { id, status: "PENDING_CONFIRMATION" },
      data: { status: "CONFIRMED", confirmedAt: now, confirmedById: userId },
    });
    if (reqUpd.count === 0) throw staffConflict("La reserva ya no está pendiente de confirmación");
  });
  return loadStaffItem(id, now);
}

/** Recepción rechaza: Shift CANCELLED + request CANCELLED (cancelledBy STAFF). */
export async function rejectByStaff(id: string, userId: string, now: Date = new Date()): Promise<OnlineBookingStaffItem> {
  void userId; // la autoría queda en el audit log de la ruta
  await prisma.$transaction(async (tx) => {
    const row = await tx.onlineBookingRequest.findUnique({
      where: { id },
      select: { id: true, status: true, shiftId: true, shift: { select: { status: true, start: true } } },
    });
    if (!row) throw new OnlineBookingError("NOT_FOUND", 404, "Reserva no encontrada");
    if (effectiveStatus(row.status, row.shift, now) !== "PENDING_CONFIRMATION") {
      throw staffConflict("La reserva ya no está pendiente de confirmación");
    }
    const upd = await tx.shift.updateMany({
      where: { id: row.shiftId, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED" },
    });
    if (upd.count === 0) throw staffConflict("El turno cambió mientras se rechazaba; actualizá la lista");
    const reqUpd = await tx.onlineBookingRequest.updateMany({
      where: { id, status: "PENDING_CONFIRMATION" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "STAFF" },
    });
    if (reqUpd.count === 0) throw staffConflict("La reserva ya no está pendiente de confirmación");
    await tx.shiftReminder.updateMany({
      where: { shiftId: row.shiftId, status: "PENDING" },
      data: { status: "FAILED", errorMessage: "Reserva online rechazada por recepción" },
    });
  });
  return loadStaffItem(id, now);
}

// ─── Utilidades de ruta ──────────────────────────────────────────────────────

/** IP del cliente para rate limit / trazabilidad (primer valor de x-forwarded-for). */
export function requestIp(req: Pick<Request, "headers">): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return (first || req.headers.get("x-real-ip")?.trim() || "unknown").slice(0, MAX_VARCHAR);
}
