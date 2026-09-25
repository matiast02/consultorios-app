import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth-utils";
import { setUserPassword } from "@/lib/credentials";
import { revokeUserSessions } from "@/lib/sessions";
import { passwordSchema } from "@/lib/validations";

const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/users/[id]/reset-password — Admin resets a user's password
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Only admin can reset passwords
    const requesterRole = await getUserRole(session.user.id);
    if (requesterRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo el administrador puede restablecer contrasenas" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await setUserPassword(prisma, id, { plain: parsed.data.newPassword });
    // Reset por admin: se invalidan todas las sesiones del usuario afectado.
    await revokeUserSessions(id);

    logAudit({
      userId: session.user.id,
      action: "UPDATE",
      resource: "user",
      resourceId: id,
      details: "Admin password reset",
      req,
    });

    return NextResponse.json({
      success: true,
      message: "Contrasena restablecida correctamente",
    });
  } catch (error) {
    console.error("POST /api/users/[id]/reset-password error:", error);
    return NextResponse.json(
      { success: false, error: "Error al restablecer contrasena" },
      { status: 500 }
    );
  }
}
