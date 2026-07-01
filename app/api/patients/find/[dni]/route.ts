import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeDni } from "@/lib/search";

type RouteContext = { params: Promise<{ dni: string }> };

// GET /api/patients/find/[dni] — Find patient by DNI (digits only, separators
// like dots / hyphens / spaces are stripped from the URL param).
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { dni: rawDni } = await context.params;
    const dni = normalizeDni(decodeURIComponent(rawDni));

    if (!dni) {
      return NextResponse.json(
        { success: false, error: "DNI inválido" },
        { status: 400 }
      );
    }

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
