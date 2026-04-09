import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/notifications/[id]/read — Mark a notification as read
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // On-demand (generated) notifications start with "generated-"
    // They are not persisted, so marking as read is a no-op
    if (id.startsWith("generated-")) {
      return NextResponse.json({ success: true, data: { id, read: true } });
    }

    // For persisted notifications, update in database
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: "Notificacion no encontrada" },
        { status: 404 }
      );
    }

    // Ensure the notification belongs to the current user
    if (notification.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 }
      );
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/notifications/[id]/read error:", error);
    return NextResponse.json(
      { success: false, error: "Error al marcar notificacion como leida" },
      { status: 500 }
    );
  }
}
