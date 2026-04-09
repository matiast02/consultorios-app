import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMedic } from "@/lib/auth-utils";

// GET /api/shifts/rescheduled — Get recently rescheduled shifts (last 48h)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const since = new Date();
    since.setHours(since.getHours() - 48);

    const where: Record<string, unknown> = {
      rescheduledAt: { gte: since },
      rescheduledFrom: { not: null },
      status: { notIn: ["CANCELLED"] },
    };

    // Medics only see their own rescheduled shifts
    if (await isMedic(userId)) {
      where.userId = userId;
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, dni: true },
        },
        user: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
      },
      orderBy: { rescheduledAt: "desc" },
    });

    return NextResponse.json({ success: true, data: shifts });
  } catch (error) {
    console.error("GET /api/shifts/rescheduled error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener turnos reprogramados" },
      { status: 500 }
    );
  }
}
