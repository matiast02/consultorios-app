import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/users/[id]/profession-config — Get profession config for a user via their specialization
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

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        specialization: {
          include: {
            professionConfig: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const professionConfig = user.specialization?.professionConfig ?? null;

    return NextResponse.json({ success: true, data: professionConfig });
  } catch (error) {
    console.error("GET /api/users/[id]/profession-config error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración de profesión del usuario" },
      { status: 500 }
    );
  }
}
