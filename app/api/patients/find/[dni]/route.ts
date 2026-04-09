import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ dni: string }> };

// GET /api/patients/find/[dni] — Find patient by DNI
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { dni } = await context.params;

    const patient = await prisma.patient.findFirst({
      where: { dni, deletedAt: null },
      include: { os: true },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    console.error("GET /api/patients/find/[dni] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al buscar paciente" },
      { status: 500 }
    );
  }
}
