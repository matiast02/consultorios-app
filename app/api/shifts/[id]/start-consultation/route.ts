import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { callToRoomSchema } from "@/lib/validations";
import { canSeeShift, getShiftActor, SHIFT_FORBIDDEN, SHIFT_NOT_FOUND } from "@/lib/shift-access";
import { callTicketForShift, waitingRoomEnabled } from "@/lib/waiting-room/tickets";

// Pase a consulta / llamado a consultorio.
//
// Recepción para cualquier turno; el médico solo para los propios (política
// de lib/shift-access.ts: ajeno → 404). Con el módulo `waiting_room` activo y
// el paciente con número de sala, además sella el ticket (calledAt, room,
// callCount) para que aparezca en la pantalla. Sin número, no hay nada que
// mostrar y `ticket` es null.

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
      select: {
        id: true,
        userId: true,
        status: true,
        arrivedAt: true,
        user: { select: { defaultRoom: true } },
      },
    });
    if (!shift || !canSeeShift(actor, shift)) {
      return NextResponse.json(SHIFT_NOT_FOUND, { status: 404 });
    }
    if (shift.status === "CANCELLED") {
      return NextResponse.json({ success: false, error: "El turno está cancelado" }, { status: 409 });
    }

    const enabled = await waitingRoomEnabled();
    // Consultorio: el del cuerpo (vacío → sin consultorio) o el habitual del profesional.
    const room =
      parsed.data.room !== undefined ? parsed.data.room || null : (shift.user?.defaultRoom ?? null);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.shift.update({
        where: { id },
        data: {
          consultationStartedAt: new Date(),
          // If patient hadn't been marked as arrived yet, set it now.
          arrivedAt: shift.arrivedAt ?? new Date(),
        },
        select: { id: true, consultationStartedAt: true, arrivedAt: true },
      });
      const ticket = enabled ? await callTicketForShift(tx, { shiftId: id, room }) : null;
      return { ...updated, ticket };
    });

    logAudit({
      userId: session.user.id,
      action: "UPDATE",
      resource: "shift",
      resourceId: id,
      details: {
        consultationStarted: true,
        ...(result.ticket ? { ticket: result.ticket.number, room: result.ticket.room } : {}),
      },
      req,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    console.error("POST /api/shifts/[id]/start-consultation error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
