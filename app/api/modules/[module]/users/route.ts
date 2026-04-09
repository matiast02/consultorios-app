import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";

type RouteContext = { params: Promise<{ module: string }> };

// GET /api/modules/[module]/users — List user access for a module (admin only)
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const role = await getUserRole(session.user.id!);
    if (role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo administradores" },
        { status: 403 }
      );
    }

    const { module } = await context.params;

    const accesses = await prisma.userModuleAccess.findMany({
      where: { module },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { userId: "asc" },
    });

    return NextResponse.json({ success: true, data: accesses });
  } catch (error) {
    console.error("GET /api/modules/[module]/users error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener accesos de modulo" },
      { status: 500 }
    );
  }
}

// PUT /api/modules/[module]/users — Toggle module access for a user (admin only)
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const role = await getUserRole(session.user.id!);
    if (role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo administradores" },
        { status: 403 }
      );
    }

    const { module } = await context.params;
    const body = await req.json();
    const { userId, enabled } = body;

    if (!userId || typeof userId !== "string" || typeof enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Datos invalidos: userId (string) y enabled (boolean) requeridos" },
        { status: 400 }
      );
    }

    const access = await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId, module } },
      update: { enabled },
      create: { userId, module, enabled },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: access });
  } catch (error) {
    console.error("PUT /api/modules/[module]/users error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar acceso de modulo" },
      { status: 500 }
    );
  }
}
