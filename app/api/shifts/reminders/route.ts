import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import {
  REMINDER_ITEM_INCLUDE,
  arDayRange,
  arTomorrowKey,
  loadReminderConfig,
  planReminders,
  reminderRowToItem,
} from "@/lib/reminders/scheduler";

async function requireReception() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }) };
  }
  if (!(await isSecretaryOrAdmin(session.user.id))) {
    return {
      error: NextResponse.json({ success: false, error: "Solo recepción o admin" }, { status: 403 }),
    };
  }
  return { userId: session.user.id };
}

// GET /api/shifts/reminders?date=YYYY-MM-DD — recordatorios de los turnos de
// esa fecha (hora argentina; default mañana). Recepción / admin.
export async function GET(req: NextRequest) {
  const guard = await requireReception();
  if ("error" in guard) return guard.error;

  try {
    const now = new Date();
    const dateParam = req.nextUrl.searchParams.get("date")?.trim();
    const dateKey = dateParam || arTomorrowKey(now);
    const range = arDayRange(dateKey);
    if (!range) {
      return NextResponse.json(
        { success: false, error: "Fecha inválida (formato YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const [config, rows] = await Promise.all([
      loadReminderConfig(),
      prisma.shiftReminder.findMany({
        where: { shift: { start: { gte: range.start, lt: range.end } } },
        include: REMINDER_ITEM_INCLUDE,
        orderBy: [{ shift: { start: "asc" } }, { offsetHours: "desc" }],
      }),
    ]);

    const items = await Promise.all(rows.map((r) => reminderRowToItem(r, config, now)));
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("GET /api/shifts/reminders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al consultar recordatorios" },
      { status: 500 },
    );
  }
}

// POST /api/shifts/reminders — planifica (crea los que faltan) sin enviar.
export async function POST() {
  const guard = await requireReception();
  if ("error" in guard) return guard.error;

  try {
    const summary = await planReminders(new Date());
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("POST /api/shifts/reminders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al planificar recordatorios" },
      { status: 500 },
    );
  }
}
