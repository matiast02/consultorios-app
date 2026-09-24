import { NextRequest } from "next/server";
import { getPublicAvailability } from "@/lib/online-booking";
import { publicBookingAvailabilityQuerySchema } from "@/lib/validations";
import { bookingErrorResponse, publicJson, rateLimited } from "../_http";

// GET /api/public/booking/availability?medicId=&from=YYYY-MM-DD&days=7&consultationTypeId=
// Solo horarios libres (nunca datos de otros turnos). 404 si el profesional no
// existe o no toma reservas online; 503 con el módulo deshabilitado.
export const dynamic = "force-dynamic";

const RATE_LIMIT = { maxRequests: 120, windowMs: 10 * 60 * 1000 };

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimited(req, "booking-availability", RATE_LIMIT);
    if (limited) return limited;

    const sp = req.nextUrl.searchParams;
    const parsed = publicBookingAvailabilityQuerySchema.safeParse({
      medicId: sp.get("medicId") ?? undefined,
      from: sp.get("from") || undefined,
      days: sp.get("days") || undefined,
      consultationTypeId: sp.get("consultationTypeId") || undefined,
    });
    if (!parsed.success) {
      return publicJson(
        { success: false, error: "Parámetros inválidos", details: parsed.error.flatten() },
        400,
      );
    }
    const q = parsed.data;

    const data = await getPublicAvailability(q.medicId, q.from, q.days, q.consultationTypeId);
    return publicJson({ success: true, data });
  } catch (error) {
    const handled = bookingErrorResponse(error);
    if (handled) return handled;
    console.error("GET /api/public/booking/availability error:", error);
    return publicJson({ success: false, error: "Error al obtener la disponibilidad" }, 500);
  }
}
