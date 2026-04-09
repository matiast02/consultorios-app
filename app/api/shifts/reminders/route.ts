import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateReminderMessage, type ShiftReminder } from "@/lib/reminders";

// POST /api/shifts/reminders — Generate reminders for shifts in the next 24 hours
// This endpoint would be called by a cron job, scheduled task, or manually from the dashboard
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find all PENDING or CONFIRMED shifts starting within the next 24 hours
    const shifts = await prisma.shift.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        start: {
          gte: now,
          lte: in24Hours,
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            telephone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { start: "asc" },
    });

    const reminders: ShiftReminder[] = shifts.map((shift) => {
      const patientName = shift.patient
        ? `${shift.patient.lastName}, ${shift.patient.firstName}`
        : "Paciente";

      const professionalName = shift.user
        ? [shift.user.firstName, shift.user.lastName].filter(Boolean).join(" ") ||
          shift.user.name ||
          "Profesional"
        : "Profesional";

      const shiftDate = new Date(shift.start);
      const date = shiftDate.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const time = shiftDate.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const base = {
        shiftId: shift.id,
        patientName,
        patientEmail: shift.patient?.email ?? null,
        patientPhone: shift.patient?.telephone ?? null,
        professionalName,
        date,
        time,
      };

      return {
        ...base,
        message: generateReminderMessage(base),
      };
    });

    return NextResponse.json({
      success: true,
      data: reminders,
      count: reminders.length,
    });
  } catch (error) {
    console.error("POST /api/shifts/reminders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar recordatorios" },
      { status: 500 }
    );
  }
}

// GET /api/shifts/reminders — Preview shifts that would receive reminders (next 24h)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const count = await prisma.shift.count({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        start: {
          gte: now,
          lte: in24Hours,
        },
      },
    });

    return NextResponse.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("GET /api/shifts/reminders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al consultar recordatorios" },
      { status: 500 }
    );
  }
}
