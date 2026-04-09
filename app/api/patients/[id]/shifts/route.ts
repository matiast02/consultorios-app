import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id]/shifts — Patient's shift history
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const skip = (page - 1) * limit;

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where: { patientId: id },
        include: {
          user: { select: { id: true, name: true, firstName: true, lastName: true } },
        },
        orderBy: { start: "desc" },
        skip,
        take: limit,
      }),
      prisma.shift.count({ where: { patientId: id } }),
    ]);

    return NextResponse.json({
      success: true,
      data: shifts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/patients/[id]/shifts error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener turnos del paciente" },
      { status: 500 }
    );
  }
}
