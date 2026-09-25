import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

// GET /api/modules — List all module configurations.
// Lectura para cualquier sesión: la UI de todos los roles la usa para ocultar
// los módulos deshabilitados. Solo el PUT es de admin.
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const modules = await prisma.moduleConfig.findMany({
      orderBy: { module: "asc" },
    });

    return NextResponse.json({ success: true, data: modules });
  } catch (error) {
    console.error("GET /api/modules error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener modulos" },
      { status: 500 }
    );
  }
}

// PUT /api/modules — Toggle a module (admin only)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
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

    const body = await req.json();
    const { module, enabled } = body;

    if (!module || typeof module !== "string" || typeof enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Datos invalidos: module (string) y enabled (boolean) requeridos" },
        { status: 400 }
      );
    }

    // Solo módulos conocidos (los crea el seed): nada de filas arbitrarias.
    const existing = await prisma.moduleConfig.findUnique({ where: { module }, select: { module: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Módulo desconocido" }, { status: 404 });
    }

    const config = await prisma.moduleConfig.update({
      where: { module },
      data: { enabled },
    });

    logAudit({ userId: session.user.id!, action: "UPDATE", resource: "module", resourceId: module, details: { enabled }, req });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("PUT /api/modules error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar modulo" },
      { status: 500 }
    );
  }
}
