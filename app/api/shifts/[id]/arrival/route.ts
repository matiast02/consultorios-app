import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { ensureTicketForShift, voidTicketForShift, waitingRoomEnabled } from "@/lib/waiting-room/tickets";

// Llegada del paciente (sala de espera). Con el módulo `waiting_room` activo
// emite —o reabre— el número de sala del día y lo devuelve en `ticket`.

export async function POST(
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
    const shift = await prisma.shift.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Turno no encontrado" }, { status: 404 });
    }
    // Un turno cancelado no entra en la sala de espera (y no debe consumir número).
    if (shift.status === "CANCELLED") {
      return NextResponse.json({ success: false, error: "El turno está cancelado" }, { status: 409 });
    }
    const issueTicket = await waitingRoomEnabled();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.shift.update({
        where: { id },
        data: { arrivedAt: new Date() },
        select: { id: true, arrivedAt: true, status: true },
      });
      const ticket = issueTicket ? await ensureTicketForShift(tx, { shiftId: id, medicId: shift.userId }) : null;
      return { ...updated, ticket };
    });
    logAudit({
      userId: session.user.id,
      action: "UPDATE",
      resource: "shift",
      resourceId: id,
      details: { arrival: true, ...(result.ticket ? { ticket: result.ticket.number } : {}) },
      req,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    console.error("POST /api/shifts/[id]/arrival error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
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
    const shift = await prisma.shift.findUnique({ where: { id }, select: { id: true } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Turno no encontrado" }, { status: 404 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.shift.update({
        where: { id },
        data: { arrivedAt: null },
        select: { id: true, arrivedAt: true },
      });
      // El número no se reutiliza; volver a registrar la llegada lo reabre.
      await voidTicketForShift(tx, id);
      return row;
    });
    logAudit({ userId: session.user.id, action: "UPDATE", resource: "shift", resourceId: id, details: { arrival: false }, req });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("DELETE /api/shifts/[id]/arrival error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
