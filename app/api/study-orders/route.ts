import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createStudyOrderSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";
import { recordClinicalVersion, studyOrderSnapshot } from "@/lib/clinical-ledger";
import { CLINICAL_FORBIDDEN, entryScope, getClinicalActor } from "@/lib/clinical-access";

// GET /api/study-orders — List study orders for a patient
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Lista blanca: solo roles clínicos leen órdenes de estudio.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const moduleEnabled = await checkModuleAccess("study_orders", session.user.id);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de ordenes de estudio no habilitado" },
        { status: 403 }
      );
    }

    const { searchParams } = req.nextUrl;
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: "patientId es requerido" },
        { status: 400 }
      );
    }

    // Médicos: solo sus órdenes. Admin: todas.
    const studyOrders = await prisma.studyOrder.findMany({
      where: { patientId, ...entryScope(actor) },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "study_order",
      resourceId: patientId,
      details: { list: true, count: studyOrders.length },
      req,
    });

    return NextResponse.json({ success: true, data: studyOrders });
  } catch (error) {
    console.error("GET /api/study-orders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener ordenes de estudio" },
      { status: 500 }
    );
  }
}

// POST /api/study-orders — Create a study order
export async function POST(req: NextRequest) {
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

    const moduleEnabled = await checkModuleAccess("study_orders", session.user.id);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de ordenes de estudio no habilitado" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createStudyOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { patientId, shiftId, items } = parsed.data;

    const authorId = actor.userId;
    const studyOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.studyOrder.create({
        data: {
          patientId,
          userId: authorId,
          shiftId: shiftId ?? null,
          items: JSON.stringify(items),
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
        entityId: created.id,
        patientId,
        action: "created",
        data: studyOrderSnapshot(created),
        authorId,
      });

      return created;
    });

    logAudit({
      userId: actor.userId,
      action: "CREATE",
      resource: "study_order",
      resourceId: studyOrder.id,
      details: { patientId, itemCount: items.length },
      req,
    });

    return NextResponse.json({ success: true, data: studyOrder }, { status: 201 });
  } catch (error) {
    console.error("POST /api/study-orders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear orden de estudio" },
      { status: 500 }
    );
  }
}
