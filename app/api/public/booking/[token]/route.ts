import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { cancelByPatient, getBookingByToken } from "@/lib/online-booking";
import { publicBookingActionSchema } from "@/lib/validations";
import { bookingErrorResponse, publicJson, rateLimited } from "../_http";

// Link de gestión de la reserva online (/reserva/<token>), sin login.
// Token inválido, vencido (el turno ya empezó) o de un paciente archivado →
// mismo 404 genérico. Sigue funcionando aunque se deshabilite el módulo, para
// que quien ya reservó pueda cancelar. Solo datos que cargó el solicitante.

type RouteContext = { params: Promise<{ token: string }> };

const RATE_LIMIT = { maxRequests: 30, windowMs: 10 * 60 * 1000 };

const notFound = () => publicJson({ success: false, error: "El link no es válido o ya venció" }, 404);

// GET /api/public/booking/[token]
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimited(req, "booking-token", RATE_LIMIT);
    if (limited) return limited;

    const { token } = await context.params;
    const view = await getBookingByToken(token);
    if (!view) return notFound();
    return publicJson({ success: true, data: view });
  } catch (error) {
    console.error("GET /api/public/booking/[token] error:", error);
    return publicJson({ success: false, error: "Error al consultar la reserva" }, 500);
  }
}

// POST /api/public/booking/[token]  { action: "cancel" }
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimited(req, "booking-token", RATE_LIMIT);
    if (limited) return limited;

    const { token } = await context.params;
    const body = await req.json().catch(() => null);
    const parsed = publicBookingActionSchema.safeParse(body);
    if (!parsed.success) {
      return publicJson({ success: false, error: "Acción inválida" }, 400);
    }

    const { view, shiftId } = await cancelByPatient(token);

    logAudit({
      userId: null,
      action: "UPDATE",
      resource: "shift",
      resourceId: shiftId,
      details: { via: "online_booking_link", action: "cancel" },
      req,
    });

    return publicJson({ success: true, data: view });
  } catch (error) {
    const handled = bookingErrorResponse(error);
    if (handled) return handled;
    console.error("POST /api/public/booking/[token] error:", error);
    return publicJson({ success: false, error: "Error al cancelar la reserva" }, 500);
  }
}
