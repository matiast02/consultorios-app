import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createConsultationTypeSchema } from "@/lib/validations";

// GET /api/consultation-types — List all consultation types
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const consultationTypes = await prisma.consultationType.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { shifts: true } },
      },
    });

    return NextResponse.json({ success: true, data: consultationTypes });
  } catch (error) {
    console.error("GET /api/consultation-types error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tipos de consulta" },
      { status: 500 }
    );
  }
}

// POST /api/consultation-types — Create consultation type
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const role = (session.user as { role?: string | null }).role;
    if (role !== "admin" && role !== "secretary") {
      return NextResponse.json(
        { success: false, error: "No tiene permisos para realizar esta accion" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createConsultationTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check unique name
    const existing = await prisma.consultationType.findFirst({
      where: { name: parsed.data.name },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe un tipo de consulta con ese nombre" },
        { status: 409 }
      );
    }

    // If isDefault=true, unset any other default first
    if (parsed.data.isDefault) {
      await prisma.consultationType.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const consultationType = await prisma.consultationType.create({
      data: {
        name: parsed.data.name,
        durationMinutes: parsed.data.durationMinutes,
        color: parsed.data.color ?? null,
        isDefault: parsed.data.isDefault ?? false,
      },
      include: {
        _count: { select: { shifts: true } },
      },
    });

    return NextResponse.json(
      { success: true, data: consultationType },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/consultation-types error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear tipo de consulta" },
      { status: 500 }
    );
  }
}
