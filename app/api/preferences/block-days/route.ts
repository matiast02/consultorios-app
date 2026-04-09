import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addBlockDaysSchema, removeBlockDaySchema } from "@/lib/validations";

// POST /api/preferences/block-days — Add blocked days (alias)
export async function POST(req: NextRequest) {
  return PUT(req);
}

// PUT /api/preferences/block-days — Add blocked days + auto-reschedule conflicting shifts
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = addBlockDaysSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, dates } = parsed.data;

    // Find active shifts on the dates being blocked
    const dateRanges = dates.map((dateStr) => {
      const d = new Date(dateStr);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    });

    const conflictingShifts = await prisma.shift.findMany({
      where: {
        userId,
        status: { notIn: ["CANCELLED", "FINISHED"] },
        OR: dateRanges.map(({ start, end }) => ({
          start: { gte: start, lt: end },
        })),
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, dni: true },
        },
      },
      orderBy: { start: "asc" },
    });

    // Auto-reschedule conflicting shifts
    const rescheduledShifts: {
      shiftId: string;
      patient: string;
      originalDate: string;
      newDate: string;
      originalTime: string;
    }[] = [];

    if (conflictingShifts.length > 0) {
      // Get user preferences to find valid days
      const preferences = await prisma.userPreference.findMany({
        where: { userId },
      });

      // Get all existing block days + the new ones being added
      const existingBlockDays = await prisma.blockDay.findMany({
        where: { userId },
      });
      const allBlockedDates = new Set([
        ...existingBlockDays.map((b) => {
          const d = new Date(b.date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }),
        ...dates,
      ]);

      for (const shift of conflictingShifts) {
        const shiftStart = new Date(shift.start);
        const shiftEnd = new Date(shift.end);
        const duration = shiftEnd.getTime() - shiftStart.getTime();
        const shiftHour = shiftStart.getHours();
        const shiftMinute = shiftStart.getMinutes();

        // Find next available day (same day of week, not blocked, with matching work hours)
        const nextDate = findNextAvailableDate(
          shiftStart,
          preferences,
          allBlockedDates,
          shiftHour,
          shiftMinute
        );

        if (nextDate) {
          const newStart = new Date(nextDate);
          newStart.setHours(shiftHour, shiftMinute, 0, 0);
          const newEnd = new Date(newStart.getTime() + duration);

          // Check for conflicts at the new time
          const conflictAtNew = await prisma.shift.findFirst({
            where: {
              userId,
              status: { notIn: ["CANCELLED"] },
              id: { not: shift.id },
              AND: [{ start: { lt: newEnd } }, { end: { gt: newStart } }],
            },
          });

          if (!conflictAtNew) {
            await prisma.shift.update({
              where: { id: shift.id },
              data: {
                start: newStart,
                end: newEnd,
                rescheduledFrom: shiftStart,
                rescheduledAt: new Date(),
              },
            });

            const patientName = shift.patient
              ? `${shift.patient.lastName}, ${shift.patient.firstName}`
              : "Paciente";

            rescheduledShifts.push({
              shiftId: shift.id,
              patient: patientName,
              originalDate: shiftStart.toISOString(),
              newDate: newStart.toISOString(),
              originalTime: `${String(shiftHour).padStart(2, "0")}:${String(shiftMinute).padStart(2, "0")}`,
            });
          }
        }
      }
    }

    // Create block days
    const result = await prisma.blockDay.createMany({
      data: dates.map((dateStr) => ({
        userId,
        date: new Date(dateStr),
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        created: result.count,
        rescheduledShifts,
      },
    });
  } catch (error) {
    console.error("PUT /api/preferences/block-days error:", error);
    return NextResponse.json(
      { success: false, error: "Error al agregar días bloqueados" },
      { status: 500 }
    );
  }
}

/**
 * Find the next available date for rescheduling a shift.
 * Looks for the next occurrence of the same day of week that is not blocked
 * and has matching work hours configured.
 */
function findNextAvailableDate(
  originalDate: Date,
  preferences: { day: number; fromHourAM: string | null; toHourAM: string | null; fromHourPM: string | null; toHourPM: string | null }[],
  blockedDates: Set<string>,
  hour: number,
  minute: number
): Date | null {
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  // Try up to 8 weeks ahead
  for (let offset = 1; offset <= 56; offset++) {
    const candidate = new Date(originalDate);
    candidate.setDate(candidate.getDate() + offset);

    const ymd = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;

    // Skip blocked dates
    if (blockedDates.has(ymd)) continue;

    // Check if this day of week has work hours configured
    const dayOfWeek = candidate.getDay();
    const pref = preferences.find((p) => p.day === dayOfWeek);
    if (!pref) continue;

    const hasAM = pref.fromHourAM && pref.toHourAM;
    const hasPM = pref.fromHourPM && pref.toHourPM;
    if (!hasAM && !hasPM) continue;

    // Check if the shift time fits in a slot
    let fits = false;
    if (hasAM && timeStr >= pref.fromHourAM! && timeStr < pref.toHourAM!) {
      fits = true;
    }
    if (!fits && hasPM && timeStr >= pref.fromHourPM! && timeStr < pref.toHourPM!) {
      fits = true;
    }

    if (fits) return candidate;
  }

  return null;
}

// DELETE /api/preferences/block-days — Remove a blocked day
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = removeBlockDaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = parsed.data;

    const existing = await prisma.blockDay.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Día bloqueado no encontrado" },
        { status: 404 }
      );
    }

    await prisma.blockDay.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/preferences/block-days error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar día bloqueado" },
      { status: 500 }
    );
  }
}
