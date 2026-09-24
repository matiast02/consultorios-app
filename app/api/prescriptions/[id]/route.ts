import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";
import { recordClinicalVersion, prescriptionSnapshot } from "@/lib/clinical-ledger";
import {
  CLINICAL_FORBIDDEN,
  canAccessEntry,
  canReadEntry,
  getClinicalActor,
  grantAuditDetails,
} from "@/lib/clinical-access";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/prescriptions/[id] — Get a single prescription
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Lista blanca: solo roles clínicos leen recetas.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
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

    // Autor, admin o concesión vigente sobre SU paciente que la cubra.
    // 404 (no 403) para no revelar la existencia de recetas ajenas.
    const read = prescription
      ? await canReadEntry(actor, prescription, prescription.patientId, "prescription")
      : null;
    if (!prescription || !read?.ok) {
      return NextResponse.json(
        { success: false, error: "Receta no encontrada" },
        { status: 404 }
      );
    }

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "prescription",
      resourceId: prescription.id,
      details: { patientId: prescription.patientId, ...grantAuditDetails(read.grantId) },
      req,
    });

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
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const annulReason =
      typeof body?.annulReason === "string" ? body.annulReason.trim() : "";

    const prescription = await prisma.prescription.findUnique({
      where: { id },
    });

    if (!prescription || !canAccessEntry(actor, prescription)) {
      return NextResponse.json(
        { success: false, error: "Receta no encontrada" },
        { status: 404 }
      );
    }

    // Solo el autor anula (el admin la ve, pero no la anula).
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
      resource: "prescription",
      resourceId: id,
      // El motivo queda en el ledger; en audit, sin texto libre clínico.
      details: { patientId: prescription.patientId, annulled: true },
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
