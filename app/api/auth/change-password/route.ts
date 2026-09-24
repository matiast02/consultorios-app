import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { setUserPassword, verifyUserPassword } from "@/lib/credentials";
import { revokeOtherSessions } from "@/lib/sessions";

// POST /api/auth/change-password
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Rate limit: 3 requests per minute per user
    const { allowed } = await checkRateLimit(`change-pw:${session.user.id}`, { maxRequests: 3, windowMs: 60000 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intenta en un minuto." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id!, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Verify current password
    const isValid = await verifyUserPassword(prisma, user.id, currentPassword);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Contrasena actual incorrecta" },
        { status: 400 }
      );
    }

    await setUserPassword(prisma, user.id, { plain: newPassword });
    // Cierra las demás sesiones (otro dispositivo / posible atacante); conserva la actual.
    await revokeOtherSessions(req.headers);

    logAudit({
      userId: user.id,
      action: "UPDATE",
      resource: "user",
      resourceId: user.id,
      details: "Password changed",
      req,
    });

    return NextResponse.json({
      success: true,
      message: "Contrasena actualizada correctamente",
    });
  } catch (error) {
    console.error("POST /api/auth/change-password error:", error);
    return NextResponse.json(
      { success: false, error: "Error al cambiar contrasena" },
      { status: 500 }
    );
  }
}
