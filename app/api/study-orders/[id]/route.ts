import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateStudyOrderSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";
import { recordClinicalVersion, studyOrderSnapshot } from "@/lib/clinical-ledger";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/study-orders/[id] — Get a single study order
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    if (!(await checkModuleAccess("study_orders", session.user.id))) {
      return NextResponse.json(
        { success: false, error: "Modulo de estudios no habilitado" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const studyOrder = await prisma.studyOrder.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!studyOrder) {
      return NextResponse.json(
        { success: false, error: "Orden de estudio no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: studyOrder });
  } catch (error) {
    console.error("GET /api/study-orders/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener orden de estudio" },
      { status: 500 }
    );
  }
}

// PUT /api/study-orders/[id] — Update status and/or resultNotes
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    if (!(await checkModuleAccess("study_orders", session.user.id))) {
      return NextResponse.json(
        { success: false, error: "Modulo de estudios no habilitado" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateStudyOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.studyOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Orden de estudio no encontrada" },
        { status: 404 }
      );
    }

    if (existing.annulledAt) {
      return NextResponse.json(
        { success: false, error: "No se puede editar una orden anulada" },
        { status: 409 }
      );
    }

    const data = parsed.data;
    const authorId = session.user.id!;

    const studyOrder = await prisma.$transaction(async (tx) => {
      const next = await tx.studyOrder.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.resultNotes !== undefined ? { resultNotes: data.resultNotes } : {}),
        },
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await recordClinicalVersion(tx, {
        entityType: "study_order",
        entityId: id,
        patientId: existing.patientId,
        action: "corrected",
        data: studyOrderSnapshot(next),
        authorId,
      });

      return next;
    });

    logAudit({
      userId: session.user.id!,
      action: "UPDATE",
      resource: "study_order" as never,
      resourceId: studyOrder.id,
      details: { updatedFields: Object.keys(data) },
      req,
    });

    return NextResponse.json({ success: true, data: studyOrder });
  } catch (error) {
    console.error("PUT /api/study-orders/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar orden de estudio" },
      { status: 500 }
    );
  }
}

// DELETE /api/study-orders/[id] — Delete a study order
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    if (!(await checkModuleAccess("study_orders", session.user.id))) {
      return NextResponse.json(
        { success: false, error: "Modulo de estudios no habilitado" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const annulReason =
      typeof body?.annulReason === "string" ? body.annulReason.trim() : "";

    const existing = await prisma.studyOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Orden de estudio no encontrada" },
        { status: 404 }
      );
    }

    if (existing.annulledAt) {
      return NextResponse.json(
        { success: false, error: "La orden ya está anulada" },
        { status: 409 }
      );
    }

    if (!annulReason) {
      return NextResponse.json(
        { success: false, error: "Se requiere un motivo para anular la orden" },
        { status: 400 }
      );
    }

    // Inalterabilidad: se anula (no se borra).
    const authorId = session.user.id!;
    await prisma.$transaction(async (tx) => {
      await tx.studyOrder.update({
        where: { id },
        data: { annulledAt: new Date(), annulReason, annulledById: authorId },
      });
      await recordClinicalVersion(tx, {
        entityType: "study_order",
        entityId: id,
        patientId: existing.patientId,
        action: "annulled",
        data: studyOrderSnapshot(existing),
        authorId,
        reason: annulReason,
      });
    });

    logAudit({
      userId: session.user.id!,
      action: "DELETE",
      resource: "study_order" as never,
      resourceId: id,
      details: { patientId: existing.patientId, annulled: true, reason: annulReason },
      req,
    });

    return NextResponse.json({ success: true, data: { id, annulled: true } });
  } catch (error) {
    console.error("DELETE /api/study-orders/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar orden de estudio" },
      { status: 500 }
    );
  }
}
