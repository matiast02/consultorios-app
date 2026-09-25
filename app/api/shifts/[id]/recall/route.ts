import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { callToRoomSchema } from "@/lib/validations";
import { canSeeShift, getShiftActor, SHIFT_FORBIDDEN, SHIFT_NOT_FOUND } from "@/lib/shift-access";
import { callTicketForShift, waitingRoomEnabled } from "@/lib/waiting-room/tickets";

// «Volver a llamar»: repite el aviso en la pantalla sin cambiar el estado del
// turno (el paciente no apareció al primer llamado). Solo tiene sentido con el
// módulo `waiting_room` activo y un paciente ya pasado a consulta con número.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const actor = await getShiftActor(session.user.id);
    if (!actor) return NextResponse.json(SHIFT_FORBIDDEN, { status: 403 });

    if (!(await waitingRoomEnabled())) {
      return NextResponse.json({ success: false, error: "La sala de espera no está activa" }, { status: 404 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = callToRoomSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const shift = await prisma.shift.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, consultationStartedAt: true },
    });
    if (!shift || !canSeeShift(actor, shift)) {
      return NextResponse.json(SHIFT_NOT_FOUND, { status: 404 });
    }
    if (!shift.consultationStartedAt || ["FINISHED", "ABSENT", "CANCELLED"].includes(shift.status)) {
      return NextResponse.json({ success: false, error: "Este paciente no está llamado a consulta" }, { status: 409 });
    }

    const ticket = await callTicketForShift(prisma, {
      shiftId: id,
      ...(parsed.data.room !== undefined ? { room: parsed.data.room || null } : {}),
    });
    if (!ticket) {
      return NextResponse.json({ success: false, error: "Este turno no tiene número de sala" }, { status: 409 });
    }

    logAudit({
      userId: session.user.id,
      action: "UPDATE",
      resource: "shift",
      resourceId: id,
      details: { recall: true, ticket: ticket.number, room: ticket.room, callCount: ticket.callCount },
      req,
    });
    return NextResponse.json({ success: true, data: { id, ticket } });
  } catch (e) {
    console.error("POST /api/shifts/[id]/recall error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
