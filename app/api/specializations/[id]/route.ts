import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateSpecializationSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/specializations/[id] — Get single specialization
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

    const specialization = await prisma.specialization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
        professionConfig: true,
      },
    });

    if (!specialization) {
      return NextResponse.json(
        { success: false, error: "Especialidad no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: specialization });
  } catch (error) {
    console.error("GET /api/specializations/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener especialidad" },
      { status: 500 }
    );
  }
}

// PUT /api/specializations/[id] — Update specialization
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

    const existing = await prisma.specialization.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Especialidad no encontrada" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateSpecializationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check unique name (case-insensitive), excluding current record
    const duplicate = await prisma.specialization.findFirst({
      where: {
        name: parsed.data.name,
        NOT: { id },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { success: false, error: "Ya existe una especialidad con ese nombre" },
        { status: 409 }
      );
    }

    const specialization = await prisma.specialization.update({
      where: { id },
      data: {
        name: parsed.data.name,
        ...(parsed.data.professionConfigId !== undefined && {
          professionConfigId: parsed.data.professionConfigId ?? null,
        }),
      },
      include: {
        _count: { select: { users: true } },
        professionConfig: true,
      },
    });

    return NextResponse.json({ success: true, data: specialization });
  } catch (error) {
    console.error("PUT /api/specializations/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar especialidad" },
      { status: 500 }
    );
  }
}

// DELETE /api/specializations/[id] — Delete specialization
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

    const existing = await prisma.specialization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Especialidad no encontrada" },
        { status: 404 }
      );
    }

    if (existing._count.users > 0) {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar una especialidad con médicos asociados" },
        { status: 409 }
      );
    }

    await prisma.specialization.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/specializations/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar especialidad" },
      { status: 500 }
    );
  }
}
