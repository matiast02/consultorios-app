import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { arDateKey, arTimeLabel, isValidDateKey, loadDayAvailability } from "@/lib/availability";

const DAY_MESSAGES = {
  NOT_WORKING: "El profesional no atiende este dia",
  NO_HOURS: "El profesional no tiene horarios configurados para este dia",
  BLOCKED: "Este dia esta bloqueado",
} as const;

// GET /api/users/:id/available-slots?date=YYYY-MM-DD&duration=30
// Returns the time-slot grid (free and taken) for a professional on a given
// date (hora AR). Agenda interna: sin buffer ni anticipación mínima; solo
// descarta los horarios ya pasados si la fecha es hoy.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: userId } = await params;
    const { searchParams } = req.nextUrl;
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const duration = parseInt(searchParams.get("duration") ?? "30", 10);

    if (!dateStr) {
      return NextResponse.json(
        { success: false, error: "El parametro date es obligatorio" },
        { status: 400 }
      );
    }

    if (!isValidDateKey(dateStr)) {
      return NextResponse.json(
        { success: false, error: "Fecha invalida" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      return NextResponse.json(
        { success: false, error: "Duracion invalida" },
        { status: 400 }
      );
    }

    const now = new Date();
    const day = await loadDayAvailability({
      medicId: userId,
      date: dateStr,
      durationMinutes: duration,
      // Si es hoy, no se ofrecen horarios que ya empezaron.
      notBefore: arDateKey(now) === dateStr ? now : null,
    });

    if (day.status !== "OPEN") {
      return NextResponse.json({
        success: true,
        data: { slots: [], message: DAY_MESSAGES[day.status] },
      });
    }

    const hours = day.hours!;
    const hasAM = hours.fromHourAM && hours.toHourAM;
    const hasPM = hours.fromHourPM && hours.toHourPM;

    return NextResponse.json({
      success: true,
      data: {
        slots: day.slots.map((s) => ({
          start: arTimeLabel(s.start),
          end: arTimeLabel(s.end),
          available: s.available,
        })),
        workHours: {
          am: hasAM ? { from: hours.fromHourAM, to: hours.toHourAM } : null,
          pm: hasPM ? { from: hours.fromHourPM, to: hours.toHourPM } : null,
        },
        duration,
      },
    });
  } catch (error) {
    console.error("GET /api/users/[id]/available-slots error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener slots disponibles" },
      { status: 500 }
    );
  }
}
