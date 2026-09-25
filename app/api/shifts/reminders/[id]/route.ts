import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { reminderActionSchema } from "@/lib/validations";
import {
  REMINDER_ITEM_INCLUDE,
  dispatchDue,
  isActiveShiftStatus,
  loadReminderConfig,
  reminderRowToItem,
} from "@/lib/reminders/scheduler";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/shifts/reminders/[id] — recepción marca un recordatorio manual
// como enviado / fallido, o reintenta uno fallido.
//   mark_sent   → SENT (sentAt = ahora). Para los manuales de WhatsApp o
//                 cuando recepción avisó por otro medio.
//   mark_failed → FAILED con `note` como motivo.
//   retry       → FAILED → PENDING y se despacha ese solo.
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    if (!(await isSecretaryOrAdmin(userId))) {
      return NextResponse.json({ success: false, error: "Solo recepción o admin" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    const parsed = reminderActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { action, note } = parsed.data;

    const reminder = await prisma.shiftReminder.findUnique({
      where: { id },
      include: { shift: { select: { id: true, start: true, status: true, patient: { select: { telephone: true } } } } },
    });
    if (!reminder) {
      return NextResponse.json({ success: false, error: "Recordatorio no encontrado" }, { status: 404 });
    }

    const now = new Date();

    if (action === "mark_sent") {
      if (reminder.status === "SENT") {
        return NextResponse.json(
          { success: false, error: "El recordatorio ya figura como enviado" },
          { status: 409 },
        );
      }
      await prisma.shiftReminder.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt: now,
          errorMessage: null,
          // Lo envió recepción a mano (WhatsApp u otro medio).
          manual: true,
          deliveredTo:
            reminder.deliveredTo ??
            (reminder.channel === "WHATSAPP" ? reminder.shift.patient.telephone : null),
        },
      });
    } else if (action === "mark_failed") {
      await prisma.shiftReminder.update({
        where: { id },
        data: { status: "FAILED", errorMessage: note || "Marcado como no enviado por recepción" },
      });
    } else {
      if (reminder.status !== "FAILED") {
        return NextResponse.json(
          { success: false, error: "Solo se pueden reintentar recordatorios fallidos" },
          { status: 409 },
        );
      }
      if (!isActiveShiftStatus(reminder.shift.status) || reminder.shift.start <= now) {
        return NextResponse.json(
          { success: false, error: "El turno ya no está vigente" },
          { status: 409 },
        );
      }
      await prisma.shiftReminder.update({
        where: { id },
        data: { status: "PENDING", errorMessage: null, sentAt: null },
      });
      // Si todavía no es su hora queda en cola; si ya venció, se despacha ahora.
      await dispatchDue(now, { reminderId: id, force: true });
    }

    logAudit({
      userId,
      action: "UPDATE",
      resource: "shift",
      resourceId: reminder.shiftId,
      details: { reminderId: id, reminderAction: action },
      req,
    });

    const [config, row] = await Promise.all([
      loadReminderConfig(),
      prisma.shiftReminder.findUnique({ where: { id }, include: REMINDER_ITEM_INCLUDE }),
    ]);
    if (!row) {
      return NextResponse.json({ success: false, error: "Recordatorio no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: await reminderRowToItem(row, config, now) });
  } catch (error) {
    console.error("PATCH /api/shifts/reminders/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar el recordatorio" },
      { status: 500 },
    );
  }
}
