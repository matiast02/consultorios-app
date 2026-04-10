import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/users/:id/available-slots?date=YYYY-MM-DD&duration=30
// Returns available time slots for a professional on a given date
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
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

    const date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { success: false, error: "Fecha invalida" },
        { status: 400 }
      );
    }

    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

    // 1. Get work hours for this day
    const preference = await prisma.userPreference.findUnique({
      where: { userId_day: { userId, day: dayOfWeek } },
    });

    if (!preference) {
      return NextResponse.json({
        success: true,
        data: { slots: [], message: "El profesional no atiende este dia" },
      });
    }

    const hasAM = preference.fromHourAM && preference.toHourAM;
    const hasPM = preference.fromHourPM && preference.toHourPM;

    if (!hasAM && !hasPM) {
      return NextResponse.json({
        success: true,
        data: { slots: [], message: "El profesional no tiene horarios configurados para este dia" },
      });
    }

    // 2. Check if day is blocked
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const blocked = await prisma.blockDay.findFirst({
      where: { userId, date: { gte: startOfDay, lt: endOfDay } },
    });

    if (blocked) {
      return NextResponse.json({
        success: true,
        data: { slots: [], message: "Este dia esta bloqueado" },
      });
    }

    // 3. Get existing shifts for this day (not cancelled)
    const existingShifts = await prisma.shift.findMany({
      where: {
        userId,
        status: { notIn: ["CANCELLED"] },
        start: { gte: startOfDay, lt: endOfDay },
      },
      select: { start: true, end: true },
    });

    // 4. Generate all possible slots from work hours
    const timeSlots: { start: string; end: string; available: boolean }[] = [];

    function generateSlots(fromHour: string, toHour: string) {
      const [fH, fM] = fromHour.split(":").map(Number);
      const [tH, tM] = toHour.split(":").map(Number);
      const startMin = fH * 60 + fM;
      const endMin = tH * 60 + tM;

      for (let min = startMin; min + duration <= endMin; min += duration) {
        const slotStartH = Math.floor(min / 60);
        const slotStartM = min % 60;
        const slotEndMin = min + duration;
        const slotEndH = Math.floor(slotEndMin / 60);
        const slotEndM = slotEndMin % 60;

        const startStr = `${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}`;
        const endStr = `${String(slotEndH).padStart(2, "0")}:${String(slotEndM).padStart(2, "0")}`;

        // Check if slot conflicts with existing shifts
        const slotStart = new Date(startOfDay);
        slotStart.setHours(slotStartH, slotStartM, 0, 0);
        const slotEnd = new Date(startOfDay);
        slotEnd.setHours(slotEndH, slotEndM, 0, 0);

        const isOccupied = existingShifts.some((s) => {
          const sStart = new Date(s.start);
          const sEnd = new Date(s.end);
          return sStart < slotEnd && sEnd > slotStart;
        });

        timeSlots.push({
          start: startStr,
          end: endStr,
          available: !isOccupied,
        });
      }
    }

    if (hasAM) generateSlots(preference.fromHourAM!, preference.toHourAM!);
    if (hasPM) generateSlots(preference.fromHourPM!, preference.toHourPM!);

    return NextResponse.json({
      success: true,
      data: {
        slots: timeSlots,
        workHours: {
          am: hasAM ? { from: preference.fromHourAM, to: preference.toHourAM } : null,
          pm: hasPM ? { from: preference.fromHourPM, to: preference.toHourPM } : null,
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
