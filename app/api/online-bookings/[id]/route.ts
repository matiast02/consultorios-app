import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { logAudit } from "@/lib/audit";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import { OnlineBookingError, confirmByStaff, rejectByStaff } from "@/lib/online-booking";
import { onlineBookingStaffActionSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/online-bookings/[id]  { action: "confirm" | "reject" }
// confirm → Shift CONFIRMED (confirmedVia STAFF); reject → Shift CANCELLED.
// 409 si la reserva ya no está pendiente (cancelada, vencida, ya confirmada).
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    if (!(await isSecretaryOrAdmin(userId))) {
      return NextResponse.json({ success: false, error: "Solo recepción o administración" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    const parsed = onlineBookingStaffActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Acción inválida" }, { status: 400 });
    }
    const { action } = parsed.data;

    const item = action === "confirm" ? await confirmByStaff(id, userId) : await rejectByStaff(id, userId);

    logAudit({
      userId,
      action: "UPDATE",
      resource: "shift",
      resourceId: item.shiftId,
      details: { via: "online_booking", action, requestId: item.id },
      req,
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    if (error instanceof OnlineBookingError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("PATCH /api/online-bookings/[id] error:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar la reserva" }, { status: 500 });
  }
}
