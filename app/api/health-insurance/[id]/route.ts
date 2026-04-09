import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateHealthInsuranceSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/health-insurance/[id] — Get specific health insurance
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

    const healthInsurance = await prisma.healthInsurance.findUnique({
      where: { id },
      include: {
        patients: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, dni: true },
        },
      },
    });

    if (!healthInsurance) {
      return NextResponse.json(
        { success: false, error: "Obra social no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: healthInsurance });
  } catch (error) {
    console.error("GET /api/health-insurance/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener obra social" },
      { status: 500 }
    );
  }
}

// PUT /api/health-insurance/[id] — Update health insurance
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.healthInsurance.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Obra social no encontrada" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateHealthInsuranceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const healthInsurance = await prisma.healthInsurance.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, data: healthInsurance });
  } catch (error) {
    console.error("PUT /api/health-insurance/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar obra social" },
      { status: 500 }
    );
  }
}

// DELETE /api/health-insurance/[id] — Delete health insurance
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.healthInsurance.findUnique({
      where: { id },
      include: {
        patients: {
          where: { deletedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Obra social no encontrada" },
        { status: 404 }
      );
    }

    if (existing.patients.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se puede eliminar: tiene pacientes asociados",
        },
        { status: 409 }
      );
    }

    await prisma.healthInsurance.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/health-insurance/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar obra social" },
      { status: 500 }
    );
  }
}
