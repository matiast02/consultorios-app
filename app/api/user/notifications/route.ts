import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateNotificationsSchema } from "@/lib/validations";

// GET /api/user/notifications — Current user's notification preferences
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Sesión inválida" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyReminder24h: true,
        notifyReminder2h: true,
        notifyNewShift: true,
        notifyCancellation: true,
        notifyWeeklySummary: true,
        notifySmsFallback: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error("GET /api/user/notifications error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener preferencias de notificaciones" },
      { status: 500 }
    );
  }
}

// PUT /api/user/notifications — Update notification toggles
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Sesión inválida" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = updateNotificationsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        notifyReminder24h: true,
        notifyReminder2h: true,
        notifyNewShift: true,
        notifyCancellation: true,
        notifyWeeklySummary: true,
        notifySmsFallback: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/user/notifications error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar notificaciones" },
      { status: 500 }
    );
  }
}
