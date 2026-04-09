import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateProfessionConfigSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/profession-configs/[id] — Get single profession config
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

    const config = await prisma.professionConfig.findUnique({
      where: { id },
      include: {
        specializations: {
          orderBy: { name: "asc" },
          include: { _count: { select: { users: true } } },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Configuración de profesión no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("GET /api/profession-configs/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración de profesión" },
      { status: 500 }
    );
  }
}

// PUT /api/profession-configs/[id] — Update profession config
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const user = session.user as { role?: string };
    if (user.role !== "admin" && user.role !== "secretary") {
      return NextResponse.json(
        { success: false, error: "Sin permisos para esta acción" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.professionConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Configuración de profesión no encontrada" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateProfessionConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check unique code if changing
    if (parsed.data.code && parsed.data.code !== existing.code) {
      const duplicate = await prisma.professionConfig.findUnique({
        where: { code: parsed.data.code },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "Ya existe una configuración con ese código" },
          { status: 409 }
        );
      }
    }

    // Build update data, stringify JSON fields if present
    const updateData: Record<string, unknown> = {};
    if (parsed.data.code !== undefined) updateData.code = parsed.data.code;
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.professionalLabel !== undefined) updateData.professionalLabel = parsed.data.professionalLabel;
    if (parsed.data.patientLabel !== undefined) updateData.patientLabel = parsed.data.patientLabel;
    if (parsed.data.prescriptionLabel !== undefined) updateData.prescriptionLabel = parsed.data.prescriptionLabel;
    if (parsed.data.evolutionLabel !== undefined) updateData.evolutionLabel = parsed.data.evolutionLabel;
    if (parsed.data.clinicalRecordLabel !== undefined) updateData.clinicalRecordLabel = parsed.data.clinicalRecordLabel;
    if (parsed.data.enabledModules !== undefined) updateData.enabledModules = JSON.stringify(parsed.data.enabledModules);
    if (parsed.data.clinicalFields !== undefined) updateData.clinicalFields = JSON.stringify(parsed.data.clinicalFields);

    const config = await prisma.professionConfig.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { specializations: true } },
      },
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("PUT /api/profession-configs/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración de profesión" },
      { status: 500 }
    );
  }
}

// DELETE /api/profession-configs/[id] — Delete profession config
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const user = session.user as { role?: string };
    if (user.role !== "admin" && user.role !== "secretary") {
      return NextResponse.json(
        { success: false, error: "Sin permisos para esta acción" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.professionConfig.findUnique({
      where: { id },
      include: {
        _count: { select: { specializations: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Configuración de profesión no encontrada" },
        { status: 404 }
      );
    }

    if (existing._count.specializations > 0) {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar: hay especialidades asociadas a esta configuración" },
        { status: 409 }
      );
    }

    await prisma.professionConfig.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/profession-configs/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar configuración de profesión" },
      { status: 500 }
    );
  }
}
