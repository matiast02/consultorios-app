import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateShiftSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { canAssignTo, canSeeShift, getShiftActor, SHIFT_FORBIDDEN, SHIFT_NOT_FOUND, SHIFT_OWN_ONLY } from "@/lib/shift-access";
import { closeTicketForShift, TICKET_CLOSE_BY_STATUS, waitingRoomEnabled } from "@/lib/waiting-room/tickets";
import { coverageData, resolveShiftCoverage } from "@/lib/shift-coverage";
import { medicShortName } from "@/lib/names";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/shifts/[id] — Single shift with patient + consultationType + medic
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const actor = await getShiftActor(session.user.id);
    if (!actor) return NextResponse.json(SHIFT_FORBIDDEN, { status: 403 });

    const { id } = await context.params;
    const { searchParams } = req.nextUrl;
    const withContext = searchParams.get("withContext") === "true";

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: {
        // Solo lo que usa la ficha del turno: nada de consentimiento ni datos de baja.
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dni: true,
            telephone: true,
            email: true,
            birthDate: true,
            sex: true,
            osNumber: true,
            os: true,
          },
        },
        consultationType: true,
        coverageInsurance: { select: { id: true, name: true, code: true } },
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            defaultRoom: true,
            specialization: { select: { id: true, name: true, color: true } },
          },
        },
        // Número de sala del día (módulo waiting_room); se expone como `ticket` solo si sigue abierto.
        waitingTicket: {
          select: {
            id: true,
            number: true,
            date: true,
            room: true,
            calledAt: true,
            lastCalledAt: true,
            callCount: true,
            closedAt: true,
          },
        },
      },
    });
    // Ajeno para un médico = inexistente (404 uniforme).
    if (!shift || !canSeeShift(actor, shift)) {
      return NextResponse.json(SHIFT_NOT_FOUND, { status: 404 });
    }

    // Ticket abierto (la ficha del médico muestra el número y permite volver a llamar).
    // Con el módulo apagado siempre null, aunque queden tickets de cuando estuvo prendido.
    const { waitingTicket, ...shiftData } = shift;
    const ticket =
      waitingTicket && !waitingTicket.closedAt && (await waitingRoomEnabled())
        ? {
            id: waitingTicket.id,
            number: waitingTicket.number,
            date: waitingTicket.date,
            room: waitingTicket.room,
            calledAt: waitingTicket.calledAt,
            lastCalledAt: waitingTicket.lastCalledAt,
            callCount: waitingTicket.callCount,
          }
        : null;

    // Optional: include last visit + next scheduled shift for this patient (for the redesigned UI).
    let lastVisit: { date: string; consultationTypeName: string | null } | null = null;
    let nextScheduled:
      | { date: string; consultationTypeName: string | null; medicShortName: string }
      | null = null;

    if (withContext && shift.patientId) {
      const [last, next] = await Promise.all([
        prisma.shift.findFirst({
          where: {
            patientId: shift.patientId,
            id: { not: shift.id },
            status: "FINISHED",
            start: { lt: shift.start },
          },
          include: { consultationType: { select: { name: true } } },
          orderBy: { start: "desc" },
        }),
        prisma.shift.findFirst({
          where: {
            patientId: shift.patientId,
            id: { not: shift.id },
            status: { in: ["PENDING", "CONFIRMED"] },
            start: { gt: shift.start },
          },
          include: {
            consultationType: { select: { name: true } },
            user: { select: { firstName: true, lastName: true, name: true } },
          },
          orderBy: { start: "asc" },
        }),
      ]);
      if (last) {
        lastVisit = {
          date: last.start.toISOString(),
          consultationTypeName: last.consultationType?.name ?? null,
        };
      }
      if (next) {
        nextScheduled = {
          date: next.start.toISOString(),
          consultationTypeName: next.consultationType?.name ?? null,
          medicShortName: medicShortName(next.user),
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...shiftData, ticket },
      meta: withContext ? { lastVisit, nextScheduled } : undefined,
    });
  } catch (error) {
    console.error("GET /api/shifts/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener turno" },
      { status: 500 }
    );
  }
}

// PUT /api/shifts/[id] — Update shift status/observations
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const actor = await getShiftActor(session.user.id);
    if (!actor) return NextResponse.json(SHIFT_FORBIDDEN, { status: 403 });

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

    if (!existing || !canSeeShift(actor, existing)) {
      return NextResponse.json(SHIFT_NOT_FOUND, { status: 404 });
    }

    const data = parsed.data;

    // Reasignar a otro profesional es tarea de recepción/admin.
    if (data.userId && !canAssignTo(actor, data.userId)) {
      return NextResponse.json(SHIFT_OWN_ONLY, { status: 403 });
    }

    if (data.patientId && data.patientId !== existing.patientId) {
      const patient = await prisma.patient.findFirst({
        where: { id: data.patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) {
        return NextResponse.json({ success: false, error: "Paciente no encontrado" }, { status: 404 });
      }
    }

    // Cambió el paciente o el profesional: se recalcula la cobertura.
    const patientChanged = !!data.patientId && data.patientId !== existing.patientId;
    const medicChanged = !!data.userId && data.userId !== existing.userId;
    const coverage =
      patientChanged || medicChanged
        ? coverageData(
            await resolveShiftCoverage(prisma, {
              userId: data.userId || existing.userId,
              patientId: data.patientId || existing.patientId,
            }),
          )
        : null;

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
        ...(coverage ?? {}),
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
        coverageInsurance: { select: { id: true, name: true, code: true } },
      },
    });

    logAudit({
      userId: session.user.id!,
      action: "UPDATE",
      resource: "shift",
      resourceId: id,
      details: data.status && data.status !== existing.status
        ? { status: data.status }
        : undefined,
      req,
    });

    // Sala de espera: finalizar, marcar ausente o cancelar cierra el número de sala (si había).
    if (data.status && data.status !== existing.status) {
      const reason = TICKET_CLOSE_BY_STATUS[data.status];
      if (reason) {
        await closeTicketForShift(prisma, id, reason).catch((e) =>
          console.error("[waiting-room] no se pudo cerrar el número:", e),
        );
      }
    }

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
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const actor = await getShiftActor(session.user.id);
    if (!actor) return NextResponse.json(SHIFT_FORBIDDEN, { status: 403 });

    const { id } = await context.params;

    const existing = await prisma.shift.findUnique({ where: { id } });

    if (!existing || !canSeeShift(actor, existing)) {
      return NextResponse.json(SHIFT_NOT_FOUND, { status: 404 });
    }

    await prisma.shift.delete({ where: { id } });

    logAudit({
      userId: session.user.id!,
      action: "DELETE",
      resource: "shift",
      resourceId: id,
      req,
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/shifts/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar turno" },
      { status: 500 }
    );
  }
}
