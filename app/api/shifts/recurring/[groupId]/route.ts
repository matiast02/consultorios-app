import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/shifts/recurring/[groupId] — Get all shifts in a recurring series
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { groupId } = await params;

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: "ID de grupo requerido" },
        { status: 400 }
      );
    }

    const shifts = await prisma.shift.findMany({
      where: { recurrenceGroupId: groupId },
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

    if (shifts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron turnos para este grupo" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: shifts });
  } catch (error) {
    console.error("GET /api/shifts/recurring/[groupId] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener turnos recurrentes" },
      { status: 500 }
    );
  }
}

// DELETE /api/shifts/recurring/[groupId] — Cancel all pending/confirmed shifts in a series
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { groupId } = await params;

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: "ID de grupo requerido" },
        { status: 400 }
      );
    }

    // Find all cancellable shifts in the series
    const result = await prisma.shift.updateMany({
      where: {
        recurrenceGroupId: groupId,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      data: {
        status: "CANCELLED",
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron turnos cancelables en este grupo" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { cancelled: result.count },
    });
  } catch (error) {
    console.error("DELETE /api/shifts/recurring/[groupId] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al cancelar turnos recurrentes" },
      { status: 500 }
    );
  }
}
