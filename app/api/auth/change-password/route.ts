import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// POST /api/auth/change-password
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
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

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id!, deletedAt: null },
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Contrasena actual incorrecta" },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

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
