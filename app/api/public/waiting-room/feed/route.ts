import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { readDisplayKey, verifyDisplayKey } from "@/lib/waiting-room/display-key";
import { buildDisplayFeed } from "@/lib/waiting-room/feed";
import { waitingRoomEnabled } from "@/lib/waiting-room/tickets";

// Feed de la pantalla de la sala de espera (/sala). Sin sesión: se autentica
// con la clave de dispositivo en el header X-Display-Key. Módulo apagado,
// clave ausente o clave incorrecta → el mismo 404 (no se distingue).
// Solo números, consultorios y horas: nunca nombres.

// La pantalla consulta cada 5 s (12/min); margen para más de un televisor
// detrás del mismo IP.
const RATE_LIMIT = { maxRequests: 90, windowMs: 60 * 1000 };
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

const notFound = () => json({ success: false, error: "No disponible" }, 404);

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`waiting-room-feed:${getClientIp(req)}`, RATE_LIMIT);
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return json(
        { success: false, error: "Demasiadas solicitudes." },
        429,
        { "Retry-After": String(retryAfter) },
      );
    }

    if (!(await waitingRoomEnabled())) return notFound();
    if (!(await verifyDisplayKey(readDisplayKey(req)))) return notFound();

    const feed = await buildDisplayFeed();
    return json({ success: true, data: feed });
  } catch (e) {
    console.error("GET /api/public/waiting-room/feed error", e);
    return json({ success: false, error: "Error" }, 500);
  }
}
