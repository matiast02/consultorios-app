import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/profession-configs — List all profession configs
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const configs = await prisma.professionConfig.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { specializations: true } },
      },
    });

    return NextResponse.json({ success: true, data: configs });
  } catch (error) {
    console.error("GET /api/profession-configs error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuraciones de profesión" },
      { status: 500 }
    );
  }
}
