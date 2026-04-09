import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";

// GET /api/modules — List all module configurations
export async function GET() {
  try {
    const session = await auth();
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

    const body = await req.json();
    const { module, enabled } = body;

    if (!module || typeof module !== "string" || typeof enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Datos invalidos: module (string) y enabled (boolean) requeridos" },
        { status: 400 }
      );
    }

    const config = await prisma.moduleConfig.upsert({
      where: { module },
      update: { enabled },
      create: { module, name: module, enabled },
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("PUT /api/modules error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar modulo" },
      { status: 500 }
    );
  }
}
