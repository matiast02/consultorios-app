import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { setUserPassword } from "@/lib/credentials";

// POST /api/auth/reset-password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // Find valid reset token
    const resetToken = await prisma.resetToken.findFirst({
      where: {
        token,
        used: false,
        expires: { gt: new Date() },
      },
    });

    if (!resetToken) {
      return NextResponse.json(
        { success: false, error: "Token invalido o expirado" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: resetToken.email, deletedAt: null },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Token invalido o expirado" },
        { status: 400 }
      );
    }

    // Update credential and mark token as used in a transaction
    await prisma.$transaction(async (tx) => {
      await setUserPassword(tx, user.id, { plain: password });
      await tx.resetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });
    });

    logAudit({
      userId: user.id,
      action: "UPDATE",
      resource: "user",
      resourceId: user.id,
      details: "Password reset completed",
      req,
    });

    return NextResponse.json({
      success: true,
      message: "Contrasena actualizada correctamente",
    });
  } catch (error) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json(
      { success: false, error: "Error al restablecer contrasena" },
      { status: 500 }
    );
  }
}
