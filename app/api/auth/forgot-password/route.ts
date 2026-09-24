import { NextRequest, NextResponse } from "next/server";
import { generateResetToken } from "@/lib/reset-token";
import { checkRateLimit } from "@/lib/rate-limit";
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

    // Rate limit por IP y por email: evita spam de tokens y enumeración por tiempo.
    const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown")
      .split(",")[0]
      .trim()
      .slice(0, 100);
    const [byIp, byEmail] = await Promise.all([
      checkRateLimit(`forgot:ip:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 }),
      checkRateLimit(`forgot:email:${email.toLowerCase()}`, { maxRequests: 3, windowMs: 60 * 60 * 1000 }),
    ]);
    if (!byIp.allowed || !byEmail.allowed) {
      return successResponse; // misma respuesta: no revela nada
    }

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

    // Token aleatorio; en DB se guarda solo el hash.
    const { token, hash } = generateResetToken();
    await prisma.resetToken.create({
      data: {
        email,
        token: hash,
        expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // TODO: envío por email (aún no hay proveedor). Mientras tanto, la URL solo
    // se muestra en desarrollo: en producción nunca va a los logs.
    if (process.env.NODE_ENV !== "production") {
      const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      console.log(`[RESET PASSWORD] (solo dev) ${base}/reset-password?token=${token}`);
    }

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
