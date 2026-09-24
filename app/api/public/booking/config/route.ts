import { NextRequest } from "next/server";
import { getPublicBookingConfig } from "@/lib/online-booking";
import { publicJson, rateLimited } from "../_http";

// GET /api/public/booking/config — sin sesión.
// Con el módulo deshabilitado responde 200 con `enabled: false` y sin
// profesionales (el contrato lo expone así para que /reservar lo muestre).
export const dynamic = "force-dynamic";

const RATE_LIMIT = { maxRequests: 60, windowMs: 10 * 60 * 1000 };

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimited(req, "booking-config", RATE_LIMIT);
    if (limited) return limited;

    const data = await getPublicBookingConfig();
    return publicJson({ success: true, data });
  } catch (error) {
    console.error("GET /api/public/booking/config error:", error);
    return publicJson({ success: false, error: "Error al obtener la configuración" }, 500);
  }
}
