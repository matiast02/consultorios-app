import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/profession-configs/[id] — Get single profession config
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const config = await prisma.professionConfig.findUnique({
      where: { id },
      include: {
        specializations: {
          orderBy: { name: "asc" },
          include: { _count: { select: { users: true } } },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Configuración de profesión no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("GET /api/profession-configs/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración de profesión" },
      { status: 500 }
    );
  }
}
