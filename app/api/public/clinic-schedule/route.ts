import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated. Aggregated weekly schedule per active medic.
export const revalidate = 60;

// UserPreference.day is Sunday-start (0=Sun..6=Sat).
// The landing uses Monday-start (0=Lun..6=Dom). This shifts the index.
function toMondayStart(sundayStartDay: number): number {
  return (sundayStartDay + 6) % 7;
}

interface Range {
  from: string;
  to: string;
}

interface DaySlot {
  dayOfWeek: number;
  am: Range | null;
  pm: Range | null;
}

function emptyWeek(): DaySlot[] {
  return Array.from({ length: 7 }, (_, dow) => ({ dayOfWeek: dow, am: null, pm: null }));
}

export async function GET() {
  try {
    const medics = await prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        roles: { some: { role: { name: "medic" } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        image: true,
        licenseNumber: true,
        specialization: { select: { id: true, name: true, color: true } },
        preferences: {
          select: {
            day: true,
            fromHourAM: true,
            toHourAM: true,
            fromHourPM: true,
            toHourPM: true,
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const data = medics.map((m) => {
      const week = emptyWeek();
      for (const p of m.preferences) {
        const dow = toMondayStart(p.day);
        const am: Range | null =
          p.fromHourAM && p.toHourAM ? { from: p.fromHourAM, to: p.toHourAM } : null;
        const pm: Range | null =
          p.fromHourPM && p.toHourPM ? { from: p.fromHourPM, to: p.toHourPM } : null;
        if (am || pm) {
          week[dow] = { dayOfWeek: dow, am, pm };
        }
      }
      return {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        name: m.name,
        image: m.image,
        licenseNumber: m.licenseNumber,
        specialization: m.specialization,
        days: week,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/public/clinic-schedule error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener horarios" },
      { status: 500 }
    );
  }
}
