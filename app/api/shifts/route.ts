import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createShiftSchema, shiftsQuerySchema } from "@/lib/validations";
import { isMedic } from "@/lib/auth-utils";

// GET /api/shifts — List shifts filtered by month/year/userId
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { searchParams } = req.nextUrl;
    const query = shiftsQuerySchema.safeParse({
      month: searchParams.get("month") || undefined,
      year: searchParams.get("year") || undefined,
      userId: searchParams.get("userId") || undefined,
      status: searchParams.get("status") || undefined,
      patientId: searchParams.get("patientId") || undefined,
    });

    if (!query.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros inválidos", details: query.error.flatten() },
        { status: 400 }
      );
    }

    const { month, year, userId, status, patientId } = query.data;
    const where: Record<string, unknown> = {};

    // Medics can only see their own shifts
    const currentUserId = session.user.id;
    if (await isMedic(currentUserId)) {
      where.userId = currentUserId;
    } else if (userId) {
      where.userId = userId;
    }

    if (status) where.status = status;
    if (patientId) where.patientId = patientId;

    // Filter by month/year range
    if (month && year) {
      where.start = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
    } else if (year) {
      where.start = { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dni: true,
            telephone: true,
            os: true,
            osNumber: true,
          },
        },
        user: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
      },
      orderBy: { start: "asc" },
    });

    return NextResponse.json({ success: true, data: shifts });
  } catch (error) {
    console.error("GET /api/shifts error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener turnos" },
      { status: 500 }
    );
  }
}

// POST /api/shifts — Create shift with conflict checking
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
    const parsed = createShiftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const start = new Date(data.start);
    const end = new Date(data.end);

    if (end <= start) {
      return NextResponse.json(
        { success: false, error: "La fecha de fin debe ser posterior a la de inicio" },
        { status: 400 }
      );
    }

    // Check for time conflicts with existing shifts for the same medic
    const conflict = await prisma.shift.findFirst({
      where: {
        userId: data.userId,
        status: { notIn: ["CANCELLED"] },
        AND: [{ start: { lt: end } }, { end: { gt: start } }],
      },
    });

    if (conflict) {
      return NextResponse.json(
        { success: false, error: "El médico ya tiene un turno en ese horario" },
        { status: 409 }
      );
    }

    // Check if the shift date is a blocked day for this medic
    const shiftDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const nextDay = new Date(shiftDateOnly);
    nextDay.setDate(nextDay.getDate() + 1);

    const blockedDay = await prisma.blockDay.findFirst({
      where: {
        userId: data.userId,
        date: { gte: shiftDateOnly, lt: nextDay },
      },
    });

    if (blockedDay) {
      return NextResponse.json(
        { success: false, error: "El médico tiene este día bloqueado" },
        { status: 409 }
      );
    }

    // Check if shift falls within configured work hours
    const dayOfWeek = start.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const preference = await prisma.userPreference.findUnique({
      where: { userId_day: { userId: data.userId, day: dayOfWeek } },
    });

    if (preference) {
      const shiftStartHHMM = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const shiftEndHHMM = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;

      let withinSlot = false;

      // Check AM slot
      if (preference.fromHourAM && preference.toHourAM) {
        if (shiftStartHHMM >= preference.fromHourAM && shiftEndHHMM <= preference.toHourAM) {
          withinSlot = true;
        }
      }

      // Check PM slot
      if (!withinSlot && preference.fromHourPM && preference.toHourPM) {
        if (shiftStartHHMM >= preference.fromHourPM && shiftEndHHMM <= preference.toHourPM) {
          withinSlot = true;
        }
      }

      // If no slots are configured at all (all null), allow it
      const hasAnySlot =
        (preference.fromHourAM && preference.toHourAM) ||
        (preference.fromHourPM && preference.toHourPM);

      if (hasAnySlot && !withinSlot) {
        return NextResponse.json(
          { success: false, error: "El turno está fuera del horario de atención configurado" },
          { status: 409 }
        );
      }
    }

    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: data.patientId, deletedAt: null },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    const shift = await prisma.shift.create({
      data: {
        userId: data.userId,
        patientId: data.patientId,
        start,
        end,
        observations: data.observations ?? null,
        status: data.status,
      },
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
    });

    return NextResponse.json({ success: true, data: shift }, { status: 201 });
  } catch (error) {
    console.error("POST /api/shifts error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear turno" },
      { status: 500 }
    );
  }
}
