import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { statsQuerySchema } from "@/lib/validations";

// GET /api/stats — Dashboard statistics
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
    const query = statsQuerySchema.safeParse({
      month: searchParams.get("month") || undefined,
      year: searchParams.get("year") || undefined,
      userId: searchParams.get("userId") || undefined,
    });

    if (!query.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros inválidos", details: query.error.flatten() },
        { status: 400 }
      );
    }

    const { month, year, userId } = query.data;

    // Build date filter
    let dateFilter: { gte: Date; lt: Date };
    if (month) {
      dateFilter = {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      };
    } else {
      dateFilter = {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      };
    }

    const baseWhere: Record<string, unknown> = {
      start: dateFilter,
    };
    if (userId) {
      baseWhere.userId = userId;
    }

    // Run all queries in parallel
    const [
      totalShifts,
      byStatus,
      totalPatients,
      byHealthInsurance,
      byMonth,
    ] = await Promise.all([
      // Total shifts in period
      prisma.shift.count({ where: baseWhere }),

      // Shifts grouped by status
      prisma.shift.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { status: true },
      }),

      // Total active patients
      prisma.patient.count({ where: { deletedAt: null } }),

      // Shifts by health insurance
      prisma.shift.findMany({
        where: baseWhere,
        select: {
          patient: {
            select: {
              os: { select: { id: true, name: true } },
            },
          },
        },
      }),

      // Shifts by month for the year
      prisma.shift.groupBy({
        by: ["start"],
        where: {
          start: {
            gte: new Date(year, 0, 1),
            lt: new Date(year + 1, 0, 1),
          },
          ...(userId ? { userId } : {}),
        },
        _count: { id: true },
      }),
    ]);

    // Process by-status into a cleaner format
    const statusCounts: Record<string, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      ABSENT: 0,
      FINISHED: 0,
      CANCELLED: 0,
    };
    for (const item of byStatus) {
      statusCounts[item.status] = item._count.status;
    }

    // Process by-health-insurance
    const hiCounts: Record<string, { name: string; count: number }> = {};
    for (const shift of byHealthInsurance) {
      const os = shift.patient.os;
      if (os) {
        if (!hiCounts[os.id]) {
          hiCounts[os.id] = { name: os.name, count: 0 };
        }
        hiCounts[os.id].count++;
      } else {
        if (!hiCounts["none"]) {
          hiCounts["none"] = { name: "Sin obra social", count: 0 };
        }
        hiCounts["none"].count++;
      }
    }

    // Process by-month into monthly counts
    const monthlyCounts: number[] = Array(12).fill(0);
    for (const item of byMonth) {
      const m = new Date(item.start).getMonth();
      monthlyCounts[m] += item._count.id;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalShifts,
        totalPatients,
        byStatus: statusCounts,
        byHealthInsurance: Object.values(hiCounts).sort(
          (a, b) => b.count - a.count
        ),
        byMonth: monthlyCounts,
        year,
      },
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}
