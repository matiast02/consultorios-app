import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runReminderCycle } from "@/lib/reminders/scheduler";

// POST /api/cron/reminders — plan + dispatch de recordatorios para un cron
// externo (cron del host, Dokploy, servicio externo). Sin sesión: se autentica
// con `Authorization: Bearer <CRON_SECRET>`.
export const dynamic = "force-dynamic";

function sha256(s: string): Buffer {
  return crypto.createHash("sha256").update(s, "utf8").digest();
}

/** Comparación en tiempo constante (sobre digests, así no filtra el largo). */
function secretMatches(provided: string, expected: string): boolean {
  return crypto.timingSafeEqual(sha256(provided), sha256(expected));
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET no configurado en el servidor" },
      { status: 503 },
    );
  }

  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match || !secretMatches(match[1].trim(), secret)) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const summary = await runReminderCycle(new Date());
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("POST /api/cron/reminders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar los recordatorios" },
      { status: 500 },
    );
  }
}
