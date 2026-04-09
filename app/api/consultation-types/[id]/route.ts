import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateConsultationTypeSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// PUT /api/consultation-types/[id] — Update consultation type
export async function PUT(req: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;

    const existing = await prisma.consultationType.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo de consulta no encontrado" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateConsultationTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check unique name if name is being updated
    if (parsed.data.name) {
      const duplicate = await prisma.consultationType.findFirst({
        where: {
          name: parsed.data.name,
          NOT: { id },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "Ya existe un tipo de consulta con ese nombre" },
          { status: 409 }
        );
      }
    }

    // If isDefault=true, unset any other default first
    if (parsed.data.isDefault) {
      await prisma.consultationType.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const consultationType = await prisma.consultationType.update({
      where: { id },
      data: parsed.data,
      include: {
        _count: { select: { shifts: true } },
      },
    });

    return NextResponse.json({ success: true, data: consultationType });
  } catch (error) {
    console.error("PUT /api/consultation-types/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar tipo de consulta" },
      { status: 500 }
    );
  }
}

// DELETE /api/consultation-types/[id] — Delete consultation type
export async function DELETE(_req: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;

    const existing = await prisma.consultationType.findUnique({
      where: { id },
      include: {
        _count: { select: { shifts: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo de consulta no encontrado" },
        { status: 404 }
      );
    }

    if (existing._count.shifts > 0) {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar un tipo de consulta con turnos asociados" },
        { status: 409 }
      );
    }

    await prisma.consultationType.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/consultation-types/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar tipo de consulta" },
      { status: 500 }
    );
  }
}
