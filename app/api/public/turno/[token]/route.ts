import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { publicShiftActionSchema } from "@/lib/validations";
import { hashConfirmationToken } from "@/lib/reminders/tokens";
import { formatReminderDate, formatReminderTime } from "@/lib/reminders/message";
import {
  firstGivenName,
  isActiveShiftStatus,
  loadReminderConfig,
  medicShortName,
  type ReminderConfig,
} from "@/lib/reminders/scheduler";
import type { PublicShiftConfirmation, ReminderResponse, ShiftStatus } from "@/types";

// Link público de confirmación de turno (/turno/<token>), sin login.
//
// El token es de un solo recordatorio, vence con el turno y solo permite
// confirmar / cancelar ese turno u optar por no recibir más recordatorios.
// Se devuelven datos mínimos: nombre de pila, fecha, profesional, dirección.
// NUNCA observaciones, tipo de consulta ni nada clínico.
//
// Token inválido, vencido o de un turno inexistente → mismo 404 (no se
// distingue para no dar pistas). Rate limit por IP compartido por GET y POST.

type RouteContext = { params: Promise<{ token: string }> };

const RATE_LIMIT = { maxRequests: 20, windowMs: 10 * 60 * 1000 };
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

const notFound = () => json({ success: false, error: "El link no es válido o ya venció" }, 404);

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

async function rateLimited(req: NextRequest): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`public-turno:${getClientIp(req)}`, RATE_LIMIT);
  if (rl.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
  return json(
    { success: false, error: "Demasiadas solicitudes. Probá de nuevo en unos minutos." },
    429,
    { "Retry-After": String(retryAfter) },
  );
}

async function findByToken(token: string, now: Date) {
  if (!TOKEN_RE.test(token)) return null;
  const reminder = await prisma.shiftReminder.findUnique({
    where: { tokenHash: hashConfirmationToken(token) },
    select: {
      id: true,
      tokenExpiresAt: true,
      response: true,
      respondedAt: true,
      shift: {
        select: {
          id: true,
          start: true,
          status: true,
          userId: true,
          patientId: true,
          patient: { select: { firstName: true, lastName: true, reminderOptOut: true, deletedAt: true } },
          user: { select: { firstName: true, lastName: true, name: true } },
          reminders: { select: { response: true, respondedAt: true } },
        },
      },
    },
  });
  if (!reminder?.shift) return null;
  if (!reminder.tokenExpiresAt || reminder.tokenExpiresAt.getTime() < now.getTime()) return null;
  if (reminder.shift.patient.deletedAt) return null;
  return reminder;
}

type TokenReminder = NonNullable<Awaited<ReturnType<typeof findByToken>>>;

function asResponse(v: string | null | undefined): ReminderResponse | null {
  return v === "CONFIRMED" || v === "CANCELLED" ? v : null;
}

/** Respuesta de este recordatorio o, si no hay, la última respondida desde otro link del mismo turno. */
function latestResponse(r: TokenReminder): ReminderResponse | null {
  const own = asResponse(r.response);
  if (own) return own;
  const answered = r.shift.reminders
    .filter((x) => asResponse(x.response) && x.respondedAt)
    .sort((a, b) => b.respondedAt!.getTime() - a.respondedAt!.getTime());
  return asResponse(answered[0]?.response);
}

function canRespond(status: string, start: Date, now: Date): boolean {
  return isActiveShiftStatus(status) && start.getTime() > now.getTime();
}

function toPublic(
  r: TokenReminder,
  config: ReminderConfig,
  now: Date,
  override: { status?: ShiftStatus; response?: ReminderResponse | null } = {},
): PublicShiftConfirmation {
  const status = override.status ?? (r.shift.status as ShiftStatus);
  return {
    clinicName: config.clinicName,
    patientFirstName: firstGivenName(r.shift.patient.firstName),
    start: r.shift.start.toISOString(),
    medicShortName: medicShortName(r.shift.user),
    address: config.address,
    status,
    canRespond: canRespond(status, r.shift.start, now),
    response: override.response !== undefined ? override.response : latestResponse(r),
  };
}

// GET /api/public/turno/[token]
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimited(req);
    if (limited) return limited;

    const { token } = await context.params;
    const now = new Date();
    const reminder = await findByToken(token, now);
    if (!reminder) return notFound();

    const config = await loadReminderConfig();
    return json({ success: true, data: toPublic(reminder, config, now) });
  } catch (error) {
    console.error("GET /api/public/turno/[token] error:", error);
    return json({ success: false, error: "Error al consultar el turno" }, 500);
  }
}

// POST /api/public/turno/[token]  { action: "confirm" | "cancel" | "opt_out" }
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimited(req);
    if (limited) return limited;

    const { token } = await context.params;
    const body = await req.json().catch(() => null);
    const parsed = publicShiftActionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ success: false, error: "Acción inválida" }, 400);
    }
    const { action } = parsed.data;

    const now = new Date();
    const reminder = await findByToken(token, now);
    if (!reminder) return notFound();

    const config = await loadReminderConfig();
    const { shift } = reminder;
    const conflict = () =>
      json(
        {
          success: false,
          error: "El turno ya no admite cambios. Si necesitás ayuda, comunicate con el consultorio.",
          data: toPublic(reminder, config, now),
        },
        409,
      );

    let view: PublicShiftConfirmation;

    if (action === "opt_out") {
      // Oposición (Ley 25.326 art. 27): vale aunque el turno ya no admita cambios.
      if (!shift.patient.reminderOptOut) {
        await prisma.patient.update({
          where: { id: shift.patientId },
          data: { reminderOptOut: true, reminderOptOutAt: now },
        });
      }
      // Los recordatorios que quedaban por enviar (incluidos los WhatsApp de recepción) se descartan.
      await prisma.shiftReminder.updateMany({
        where: { status: "PENDING", shift: { patientId: shift.patientId } },
        data: { status: "FAILED", errorMessage: "El paciente pidió no recibir recordatorios" },
      });
      view = toPublic(reminder, config, now);
    } else {
      if (!canRespond(shift.status, shift.start, now)) return conflict();

      const activeWhere = {
        id: shift.id,
        status: { in: ["PENDING" as const, "CONFIRMED" as const] },
        start: { gt: now },
      };
      const response: ReminderResponse = action === "confirm" ? "CONFIRMED" : "CANCELLED";

      // Condicional: si recepción lo canceló / finalizó entre la lectura y la escritura → 409.
      const updated = await prisma.shift.updateMany({
        where: activeWhere,
        data:
          action === "confirm"
            ? { status: "CONFIRMED", confirmedAt: now, confirmedVia: "PATIENT_LINK" }
            : { status: "CANCELLED" },
      });
      if (updated.count === 0) return conflict();

      await prisma.shiftReminder.update({
        where: { id: reminder.id },
        data: { response, respondedAt: now },
      });

      if (action === "cancel") {
        await prisma.shiftReminder.updateMany({
          where: { shiftId: shift.id, status: "PENDING" },
          data: { status: "FAILED", errorMessage: "Turno cancelado por el paciente" },
        });
        // Aviso al profesional (sin datos clínicos). No bloquea la respuesta.
        void prisma.notification
          .create({
            data: {
              userId: shift.userId,
              type: "shift_cancelled_by_patient",
              title: "Turno cancelado por el paciente",
              message: `${shift.patient.lastName}, ${firstGivenName(shift.patient.firstName)} canceló su turno del ${formatReminderDate(shift.start)} a las ${formatReminderTime(shift.start)} desde el link del recordatorio.`,
              resourceId: shift.id,
            },
          })
          .catch((e: unknown) => console.error("[public/turno] No se pudo crear la notificación:", e));
      }

      view = toPublic(reminder, config, now, {
        status: action === "confirm" ? "CONFIRMED" : "CANCELLED",
        response,
      });
    }

    logAudit({
      userId: null,
      action: "UPDATE",
      resource: "shift",
      resourceId: shift.id,
      details: { via: "patient_link", action },
      req,
    });

    return json({ success: true, data: view });
  } catch (error) {
    console.error("POST /api/public/turno/[token] error:", error);
    return json({ success: false, error: "Error al procesar la respuesta" }, 500);
  }
}
