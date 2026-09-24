import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import {
  bookingManagePath,
  createOnlineBooking,
  loadOnlineBookingSettings,
  requestIp,
} from "@/lib/online-booking";
import { publicBookingCreateSchema } from "@/lib/validations";
import type { PublicBookingCreated } from "@/types";
import { bookingErrorResponse, publicJson, rateLimited } from "./_http";

// POST /api/public/booking — reserva online sin cuenta.
//
// Anti-abuso: rate limit por IP (10/hora), honeypot `_hp` y tiempo mínimo en
// el formulario `_elapsedMs` (como el formulario de contacto: a un bot se le
// responde algo con forma de éxito para que no detecte la trampa), máximo 3
// reservas pendientes por DNI y re-chequeo del hueco dentro de la transacción.
// Privacidad: la respuesta solo repite lo que cargó el solicitante.

const RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };
const MIN_ELAPSED_MS = 3000;

function decoy(body: Record<string, unknown>): PublicBookingCreated {
  const start =
    typeof body.start === "string" && !Number.isNaN(Date.parse(body.start))
      ? new Date(body.start).toISOString()
      : new Date().toISOString();
  return {
    requestId: `c${crypto.randomBytes(12).toString("hex")}`,
    status: "PENDING_CONFIRMATION",
    start,
    medicShortName: "Profesional",
    manageUrl: bookingManagePath(crypto.randomBytes(24).toString("base64url")),
    emailSent: false,
    message:
      "Recibimos tu pedido de turno. Recepción se va a comunicar para confirmarlo. Guardá este link para ver el estado o cancelarlo.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimited(req, "booking-create", RATE_LIMIT);
    if (limited) return limited;

    const settings = await loadOnlineBookingSettings();
    if (!settings.enabled) {
      return publicJson(
        { success: false, code: "DISABLED", error: "Las reservas online no están disponibles en este momento." },
        503,
      );
    }

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return publicJson({ success: false, error: "Datos inválidos" }, 400);
    }
    const raw = body as Record<string, unknown>;

    // ── Anti-bot (sin servicios externos) ──
    const honeypot = typeof raw._hp === "string" ? raw._hp.trim() : "";
    const elapsedMs = typeof raw._elapsedMs === "number" ? raw._elapsedMs : null;
    if (honeypot.length > 0 || (elapsedMs !== null && elapsedMs < MIN_ELAPSED_MS)) {
      return publicJson({ success: true, data: decoy(raw) }, 201);
    }

    const parsed = publicBookingCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return publicJson(
        { success: false, error: "Revisá los datos marcados.", details: parsed.error.flatten() },
        400,
      );
    }

    const result = await createOnlineBooking(
      parsed.data,
      { ip: requestIp(req), userAgent: req.headers.get("user-agent") },
      { settings },
    );

    // Trazabilidad (sin datos personales en details).
    logAudit({
      userId: null,
      action: "CREATE",
      resource: "shift",
      resourceId: result.shiftId,
      details: { via: "online_booking", requestId: result.created.requestId },
      req,
    });
    if (result.createdPatient) {
      logAudit({
        userId: null,
        action: "CREATE",
        resource: "patient",
        resourceId: result.patientId,
        details: { via: "online_booking", requestId: result.created.requestId },
        req,
      });
    }

    return publicJson({ success: true, data: result.created }, 201);
  } catch (error) {
    const handled = bookingErrorResponse(error);
    if (handled) return handled;
    console.error("POST /api/public/booking error:", error);
    return publicJson({ success: false, error: "No pudimos registrar la reserva. Probá de nuevo en unos minutos." }, 500);
  }
}
