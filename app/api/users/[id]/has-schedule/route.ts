import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/users/:id/has-schedule — Check if user has configured work schedule
export async function GET(
  _req: NextRequest,
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

    const { id } = await params;

    // Count preferences that have at least one time slot configured
    const count = await prisma.userPreference.count({
      where: {
        userId: id,
        OR: [
          { fromHourAM: { not: null } },
          { toHourAM: { not: null } },
          { fromHourPM: { not: null } },
          { toHourPM: { not: null } },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      data: { hasSchedule: count > 0 },
    });
  } catch (error) {
    console.error("GET /api/users/[id]/has-schedule error:", error);
    return NextResponse.json(
      { success: false, error: "Error al verificar horarios" },
      { status: 500 }
    );
  }
}
