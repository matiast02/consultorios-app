import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isSecretary } from "@/lib/auth-utils";
import { checkModuleAccess } from "@/lib/modules";
import { recordClinicalVersion, prescriptionSnapshot } from "@/lib/clinical-ledger";

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

    if (!(await checkModuleAccess("prescriptions", session.user.id))) {
      return NextResponse.json(
        { success: false, error: "Modulo de recetas no habilitado" },
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
    const body = await req.json().catch(() => ({}));
    const annulReason =
      typeof body?.annulReason === "string" ? body.annulReason.trim() : "";

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
        { success: false, error: "Solo el creador puede anular esta receta" },
        { status: 403 }
      );
    }

    if (prescription.annulledAt) {
      return NextResponse.json(
        { success: false, error: "La receta ya está anulada" },
        { status: 409 }
      );
    }

    if (!annulReason) {
      return NextResponse.json(
        { success: false, error: "Se requiere un motivo para anular la receta" },
        { status: 400 }
      );
    }

    // Inalterabilidad: se anula (no se borra).
    const authorId = session.user.id!;
    await prisma.$transaction(async (tx) => {
      await tx.prescription.update({
        where: { id },
        data: { annulledAt: new Date(), annulReason, annulledById: authorId },
      });
      await recordClinicalVersion(tx, {
        entityType: "prescription",
        entityId: id,
        patientId: prescription.patientId,
        action: "annulled",
        data: prescriptionSnapshot(prescription),
        authorId,
        reason: annulReason,
      });
    });

    logAudit({
      userId: session.user.id!,
      action: "DELETE",
      resource: "prescription" as never,
      resourceId: id,
      details: { patientId: prescription.patientId, annulled: true, reason: annulReason },
      req,
    });

    return NextResponse.json({ success: true, data: { id, annulled: true } });
  } catch (error) {
    console.error("DELETE /api/prescriptions/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar receta" },
      { status: 500 }
    );
  }
}
