import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// POST /api/auth/forgot-password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Always return success to avoid revealing whether email exists
    const successResponse = NextResponse.json({
      success: true,
      message: "Si el email existe, se envio un enlace de recuperacion",
    });

    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      return successResponse;
    }

    // Mark any previous unused tokens for this email as used
    await prisma.resetToken.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");

    // Create reset token with 1-hour expiry
    await prisma.resetToken.create({
      data: {
        email,
        token,
        expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Log the reset URL (email integration later)
    console.log(
      `[RESET PASSWORD] URL: http://localhost:3000/reset-password?token=${token}`
    );

    logAudit({
      userId: user.id,
      action: "UPDATE",
      resource: "user",
      resourceId: user.id,
      details: "Password reset requested",
      req,
    });

    return successResponse;
  } catch (error) {
    console.error("POST /api/auth/forgot-password error:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar solicitud" },
      { status: 500 }
    );
  }
}
