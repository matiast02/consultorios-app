import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateShiftSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// PUT /api/shifts/[id] — Update shift status/observations
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateShiftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.shift.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Turno no encontrado" },
        { status: 404 }
      );
    }

    const data = parsed.data;

    // If changing time, check for conflicts
    if (data.start || data.end) {
      const newStart = data.start ? new Date(data.start) : existing.start;
      const newEnd = data.end ? new Date(data.end) : existing.end;
      const targetUserId = data.userId || existing.userId;

      if (newEnd <= newStart) {
        return NextResponse.json(
          { success: false, error: "La fecha de fin debe ser posterior a la de inicio" },
          { status: 400 }
        );
      }

      const conflict = await prisma.shift.findFirst({
        where: {
          userId: targetUserId,
          id: { not: id },
          status: { notIn: ["CANCELLED"] },
          AND: [{ start: { lt: newEnd } }, { end: { gt: newStart } }],
        },
      });

      if (conflict) {
        return NextResponse.json(
          { success: false, error: "El médico ya tiene un turno en ese horario" },
          { status: 409 }
        );
      }
    }

    const shift = await prisma.shift.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.observations !== undefined && { observations: data.observations }),
        ...(data.start && { start: new Date(data.start) }),
        ...(data.end && { end: new Date(data.end) }),
        ...(data.patientId && { patientId: data.patientId }),
        ...(data.userId && { userId: data.userId }),
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

    return NextResponse.json({ success: true, data: shift });
  } catch (error) {
    console.error("PUT /api/shifts/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar turno" },
      { status: 500 }
    );
  }
}

// DELETE /api/shifts/[id] — Delete shift
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.shift.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Turno no encontrado" },
        { status: 404 }
      );
    }

    await prisma.shift.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/shifts/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar turno" },
      { status: 500 }
    );
  }
}
