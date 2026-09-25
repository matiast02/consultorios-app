import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import { closeTicketForWalkIn, moveTicketToShift, voidTicketForWalkIn } from "@/lib/waiting-room/tickets";

// El número de sala (módulo `waiting_room`) sigue al walk-in: «Retiró» lo
// cierra (LEFT), asignarle un turno lo traslada al turno con el mismo número,
// borrarlo lo anula. Con el módulo apagado no hay ticket y estas llamadas no
// hacen nada.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.walkInArrival.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Llegada no encontrada" }, { status: 404 });
    }
    const body = (await req.json()) as {
      leftAt?: string | null;
      assignedShiftId?: string | null;
      note?: string | null;
      markLeftNow?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (body.markLeftNow) {
      data.leftAt = new Date();
    } else if (body.leftAt !== undefined) {
      data.leftAt = body.leftAt ? new Date(body.leftAt) : null;
    }
    if (body.assignedShiftId !== undefined) data.assignedShiftId = body.assignedShiftId;
    if (body.note !== undefined) data.note = body.note;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.walkInArrival.update({ where: { id }, data });
      if (data.leftAt instanceof Date) await closeTicketForWalkIn(tx, id, "LEFT");
      if (typeof body.assignedShiftId === "string" && body.assignedShiftId) {
        await moveTicketToShift(tx, { walkInId: id, shiftId: body.assignedShiftId });
      }
      return row;
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("PATCH /api/walk-ins/[id] error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.walkInArrival.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Llegada no encontrada" }, { status: 404 });
    }
    await prisma.$transaction(async (tx) => {
      await voidTicketForWalkIn(tx, id);
      await tx.walkInArrival.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/walk-ins/[id] error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
