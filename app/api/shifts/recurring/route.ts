import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createRecurringShiftsSchema } from "@/lib/validations";

// POST /api/shifts/recurring — Create a recurring series of shifts
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createRecurringShiftsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      userId,
      patientId,
      startDate,
      startTime,
      endTime,
      frequencyWeeks,
      count,
      consultationTypeId,
    } = parsed.data;

    // Validate that endTime is after startTime
    if (endTime <= startTime) {
      return NextResponse.json(
        { success: false, error: "La hora de fin debe ser posterior a la de inicio" },
        { status: 400 }
      );
    }

    // Verify patient exists and is not soft-deleted
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    // Generate recurrence group ID
    const recurrenceGroupId = crypto.randomUUID();

    // Fetch blocked days and preferences for the medic
    const blockDays = await prisma.blockDay.findMany({ where: { userId } });
    const preferences = await prisma.userPreference.findMany({ where: { userId } });

    // Build a lookup map for preferences by day of week
    const prefByDay = new Map<number, (typeof preferences)[number]>();
    for (const pref of preferences) {
      prefByDay.set(pref.day, pref);
    }

    // Build a set of blocked dates for quick lookup (YYYY-MM-DD strings)
    const blockedDateSet = new Set<string>();
    for (const bd of blockDays) {
      const d = new Date(bd.date);
      blockedDateSet.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }

    // Calculate the dates for the recurring series
    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const baseDate = new Date(startYear, startMonth - 1, startDay);

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    interface SkippedEntry {
      date: string;
      reason: string;
    }

    const toCreate: {
      userId: string;
      patientId: string;
      start: Date;
      end: Date;
      status: "PENDING";
      consultationTypeId: string | null;
      recurrenceGroupId: string;
    }[] = [];
    const skipped: SkippedEntry[] = [];

    for (let i = 0; i < count; i++) {
      const shiftDate = new Date(baseDate);
      shiftDate.setDate(shiftDate.getDate() + i * frequencyWeeks * 7);

      const dateStr = `${shiftDate.getFullYear()}-${String(shiftDate.getMonth() + 1).padStart(2, "0")}-${String(shiftDate.getDate()).padStart(2, "0")}`;
      const dayOfWeek = shiftDate.getDay(); // 0=Sunday ... 6=Saturday

      // 5a. Check blocked day
      if (blockedDateSet.has(dateStr)) {
        skipped.push({ date: dateStr, reason: "El médico tiene este día bloqueado" });
        continue;
      }

      // 5b. Check work hours preference
      const pref = prefByDay.get(dayOfWeek);
      if (pref) {
        let withinSlot = false;

        // Check AM slot
        if (pref.fromHourAM && pref.toHourAM) {
          if (startTime >= pref.fromHourAM && endTime <= pref.toHourAM) {
            withinSlot = true;
          }
        }

        // Check PM slot
        if (!withinSlot && pref.fromHourPM && pref.toHourPM) {
          if (startTime >= pref.fromHourPM && endTime <= pref.toHourPM) {
            withinSlot = true;
          }
        }

        const hasAnySlot =
          (pref.fromHourAM && pref.toHourAM) ||
          (pref.fromHourPM && pref.toHourPM);

        if (hasAnySlot && !withinSlot) {
          skipped.push({ date: dateStr, reason: "Fuera del horario de atención configurado" });
          continue;
        }
      }

      // Build full start/end DateTime
      const shiftStart = new Date(shiftDate);
      shiftStart.setHours(startH, startM, 0, 0);

      const shiftEnd = new Date(shiftDate);
      shiftEnd.setHours(endH, endM, 0, 0);

      // 5c. Check for time conflicts with existing shifts
      const conflict = await prisma.shift.findFirst({
        where: {
          userId,
          status: { notIn: ["CANCELLED"] },
          AND: [{ start: { lt: shiftEnd } }, { end: { gt: shiftStart } }],
        },
        include: {
          patient: { select: { firstName: true, lastName: true } },
        },
      });

      if (conflict) {
        const conflictTime = new Date(conflict.start).toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const conflictPatient = conflict.patient
          ? `${conflict.patient.lastName}, ${conflict.patient.firstName}`
          : "otro paciente";
        skipped.push({
          date: dateStr,
          reason: `Conflicto con turno existente a las ${conflictTime} con ${conflictPatient}`,
        });
        continue;
      }

      // 5d. All checks passed — add to creation list
      toCreate.push({
        userId,
        patientId,
        start: shiftStart,
        end: shiftEnd,
        status: "PENDING",
        consultationTypeId: consultationTypeId ?? null,
        recurrenceGroupId,
      });
    }

    // 6. Create all valid shifts in a transaction
    let created: Awaited<ReturnType<typeof prisma.shift.create>>[] = [];

    if (toCreate.length > 0) {
      created = await prisma.$transaction(
        toCreate.map((shiftData) =>
          prisma.shift.create({
            data: shiftData,
            include: {
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  dni: true,
                  os: true,
                },
              },
              user: {
                select: { id: true, name: true, firstName: true, lastName: true },
              },
            },
          })
        )
      );
    }

    // 7. Return response
    return NextResponse.json(
      {
        success: true,
        data: {
          created,
          skipped,
          recurrenceGroupId: toCreate.length > 0 ? recurrenceGroupId : null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/shifts/recurring error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear turnos recurrentes" },
      { status: 500 }
    );
  }
}
