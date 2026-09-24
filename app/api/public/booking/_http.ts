// Helpers HTTP compartidos por las rutas públicas de reserva online.
// (Archivo colocado: no es una ruta porque no se llama route.ts.)

import { NextResponse } from "next/server";
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit";
import { OnlineBookingError, requestIp } from "@/lib/online-booking";

const PUBLIC_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export function publicJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...PUBLIC_HEADERS, ...headers } });
}

/** 429 si la IP superó el límite de `bucket`; null si puede seguir. */
export async function rateLimited(
  req: Pick<Request, "headers">,
  bucket: string,
  config: RateLimitConfig,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`${bucket}:${requestIp(req)}`, config);
  if (rl.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
  return publicJson(
    { success: false, error: "Demasiadas solicitudes. Probá de nuevo en unos minutos." },
    429,
    { "Retry-After": String(retryAfter) },
  );
}

/** Traduce OnlineBookingError a respuesta; null si es otro error (→ 500). */
export function bookingErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof OnlineBookingError)) return null;
  return publicJson(
    {
      success: false,
      error: error.message,
      code: error.code,
      ...(error.data !== undefined ? { data: error.data } : {}),
    },
    error.status,
  );
}
