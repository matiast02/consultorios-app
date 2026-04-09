import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updatePatientSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id] — Patient detail
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

    const patient = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
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
    console.error("GET /api/patients/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener paciente" },
      { status: 500 }
    );
  }
}

// PUT /api/patients/[id] — Update patient
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
    const body = await req.json();
    const parsed = updatePatientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    const data = parsed.data;

    // Check unique DNI if changing it
    if (data.dni && data.dni !== existing.dni) {
      const duplicate = await prisma.patient.findFirst({
        where: { dni: data.dni, deletedAt: null, id: { not: id } },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "Ya existe un paciente con ese DNI" },
          { status: 409 }
        );
      }
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        ...data,
        birthDate:
          data.birthDate !== undefined
            ? data.birthDate
              ? new Date(data.birthDate)
              : null
            : undefined,
      },
      include: { os: true },
    });

    logAudit({
      userId: session.user.id!,
      action: "UPDATE",
      resource: "patient",
      resourceId: id,
      details: { fields: Object.keys(parsed.data) },
      req,
    });

    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    console.error("PUT /api/patients/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar paciente" },
      { status: 500 }
    );
  }
}

// DELETE /api/patients/[id] — Soft delete patient
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    await prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    logAudit({
      userId: session.user.id!,
      action: "DELETE",
      resource: "patient",
      resourceId: id,
      req,
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/patients/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar paciente" },
      { status: 500 }
    );
  }
}
