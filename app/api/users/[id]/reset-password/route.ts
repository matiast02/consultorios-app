import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth-utils";

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "La contrasena debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayuscula")
    .regex(/[0-9]/, "Debe contener al menos un numero"),
});

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/users/[id]/reset-password — Admin resets a user's password
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
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

    const hashedPassword = await bcrypt.hash(parsed.data.newPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

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
