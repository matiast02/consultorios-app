import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createSpecializationSchema } from "@/lib/validations";

// GET /api/specializations — List all specializations
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const specializations = await prisma.specialization.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true } },
        professionConfig: true,
      },
    });

    return NextResponse.json({ success: true, data: specializations });
  } catch (error) {
    console.error("GET /api/specializations error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener especialidades" },
      { status: 500 }
    );
  }
}

// POST /api/specializations — Create specialization
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createSpecializationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check unique name (case-insensitive)
    const existing = await prisma.specialization.findFirst({
      where: {
        name: parsed.data.name,
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe una especialidad con ese nombre" },
        { status: 409 }
      );
    }

    const specialization = await prisma.specialization.create({
      data: {
        name: parsed.data.name,
        professionConfigId: parsed.data.professionConfigId ?? null,
      },
      include: {
        _count: { select: { users: true } },
        professionConfig: true,
      },
    });

    return NextResponse.json(
      { success: true, data: specialization },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/specializations error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear especialidad" },
      { status: 500 }
    );
  }
}
