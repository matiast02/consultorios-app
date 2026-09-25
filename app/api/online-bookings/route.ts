import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import { listForStaff } from "@/lib/online-booking";
import { onlineBookingsQuerySchema } from "@/lib/validations";

// GET /api/online-bookings?status=PENDING_CONFIRMATION|CONFIRMED|CANCELLED|EXPIRED
// Reservas online para recepción / admin (incluye lo que cargó el solicitante
// para verificar por teléfono antes de confirmar).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Solo recepción o administración" }, { status: 403 });
    }

    const parsed = onlineBookingsQuerySchema.safeParse({
      status: req.nextUrl.searchParams.get("status") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await listForStaff(parsed.data.status);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/online-bookings error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener las reservas online" }, { status: 500 });
  }
}
