import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/users/[id]/availability — Get user work hours + block days for a month
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: userId } = await context.params;
    const { searchParams } = req.nextUrl;
    const month = parseInt(searchParams.get("month") || "", 10);
    const year = parseInt(searchParams.get("year") || "", 10);

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: "Los parámetros 'month' y 'year' son obligatorios y deben ser válidos" },
        { status: 400 }
      );
    }

    // Date range for the requested month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const [preferences, blockDays] = await Promise.all([
      prisma.userPreference.findMany({
        where: { userId },
        orderBy: { day: "asc" },
      }),
      prisma.blockDay.findMany({
        where: {
          userId,
          date: { gte: startDate, lt: endDate },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        userId,
        month,
        year,
        preferences,
        blockDays,
      },
    });
  } catch (error) {
    console.error("GET /api/users/[id]/availability error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener disponibilidad" },
      { status: 500 }
    );
  }
}
