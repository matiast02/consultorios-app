import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/auth";
import { getUserRole } from "@/lib/auth-utils";
import { hashPassword, setUserPassword } from "@/lib/credentials";
import { passwordSchema } from "@/lib/validations";
import { sendInvitationEmail } from "@/lib/password-setup-email";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  // Opcional: si viene, el usuario se crea ya con su rol (nunca queda sin rol).
  role: z.enum(["medic", "secretary", "admin"]).optional(),
  // Opcional: manda al email un link para definir la contraseña (72 h).
  sendInvite: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Auth required: only admin can register users
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const requesterRole = await getUserRole(session.user.id);
    if (requesterRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo el administrador puede registrar usuarios" },
        { status: 403 }
      );
    }

    // Rate limit: 5 requests per minute per IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const { allowed } = await checkRateLimit(`register:${ip}`, { maxRequests: 5, windowMs: 60000 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intenta en un minuto." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, role, sendInvite } = parsed.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con este email" },
        { status: 409 }
      );
    }

    const roleRecord = role
      ? await prisma.role.findUnique({ where: { name: role }, select: { id: true } })
      : null;
    if (role && !roleRecord) {
      return NextResponse.json(
        { error: "El rol indicado no existe" },
        { status: 400 }
      );
    }

    // bcrypt fuera de la transacción: no mantenerla abierta durante el hash.
    const passwordHash = await hashPassword(password);

    // User + credencial + rol atómicos: si algo falla, no queda un usuario a medias.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      // La credencial vive en Account (providerId "credential"), hash bcrypt.
      await setUserPassword(tx, created.id, { hash: passwordHash });

      if (roleRecord) {
        await tx.userRole.create({
          data: { userId: created.id, roleId: roleRecord.id },
        });
      }

      return created;
    });

    logAudit({
      userId: session.user.id,
      action: "CREATE",
      resource: "user",
      resourceId: user.id,
      details: { name, email, role: role ?? null, createdBy: session.user.id },
      req: request,
    });

    // Invitación: link de definición de contraseña por el proveedor de email
    // configurado. Si falla, el usuario igual queda creado y se informa.
    let invite: { sent: boolean; provider: string; error?: string } | null = null;
    if (sendInvite) {
      const result = await sendInvitationEmail({ email, name });
      invite = { sent: result.ok, provider: result.provider, ...(result.error ? { error: result.error } : {}) };
      if (!result.ok) console.warn(`[register] invitación a ${email} no enviada (${result.provider}): ${result.error}`);
    }

    return NextResponse.json(
      { message: "Account created successfully", user, invite },
      { status: 201 }
    );
  } catch (error) {
    console.error("[REGISTER_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
