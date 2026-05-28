import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isSecretary } from "@/lib/auth-utils";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/prescriptions/[id] — Get a single prescription
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Secretaries cannot read prescriptions.
    if (await isSecretary(session.user.id)) {
      return NextResponse.json(
        { success: false, error: "Sin acceso a recetas" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, dni: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!prescription) {
      return NextResponse.json(
        { success: false, error: "Receta no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: prescription });
  } catch (error) {
    console.error("GET /api/prescriptions/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener receta" },
      { status: 500 }
    );
  }
}

// DELETE /api/prescriptions/[id] — Delete a prescription (creator only, no secretaries)
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    if (await isSecretary(session.user.id)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para esta operación" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const prescription = await prisma.prescription.findUnique({
      where: { id },
    });

    if (!prescription) {
      return NextResponse.json(
        { success: false, error: "Receta no encontrada" },
        { status: 404 }
      );
    }

    if (prescription.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Solo el creador puede eliminar esta receta" },
        { status: 403 }
      );
    }

    await prisma.prescription.delete({
      where: { id },
    });

    logAudit({
      userId: session.user.id!,
      action: "DELETE",
      resource: "prescription" as never,
      resourceId: id,
      details: { patientId: prescription.patientId },
      req,
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/prescriptions/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar receta" },
      { status: 500 }
    );
  }
}
