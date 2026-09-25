import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPrescriptionSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";
import { recordClinicalVersion, prescriptionSnapshot } from "@/lib/clinical-ledger";
import {
  CLINICAL_FORBIDDEN,
  getClinicalActor,
  grantAuditDetails,
  readScopeForList,
} from "@/lib/clinical-access";

// GET /api/prescriptions — List prescriptions for a patient
export async function GET(req: NextRequest) {
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

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de recetas no habilitado" },
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

    // Médicos: sus recetas + las que cubra una concesión vigente. Admin: todas.
    const scope = await readScopeForList(actor, patientId, "prescription");
    const prescriptions = await prisma.prescription.findMany({
      where: { patientId, ...scope.where },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "prescription",
      resourceId: patientId,
      details: { list: true, count: prescriptions.length, ...grantAuditDetails(scope.grantId) },
      req,
    });

    return NextResponse.json({ success: true, data: prescriptions });
  } catch (error) {
    console.error("GET /api/prescriptions error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener recetas" },
      { status: 500 }
    );
  }
}

// POST /api/prescriptions — Create a prescription (medics only)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Solo médicos prescriben.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }
    if (!actor.isMedic) {
      return NextResponse.json(
        { success: false, error: "Solo profesionales médicos pueden emitir recetas" },
        { status: 403 }
      );
    }

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de recetas no habilitado" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createPrescriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { patientId, shiftId, items, diagnosis, notes, durationDays } = parsed.data;

    const authorId = session.user.id!;
    const prescription = await prisma.$transaction(async (tx) => {
      const created = await tx.prescription.create({
        data: {
          patientId,
          userId: authorId,
          shiftId: shiftId ?? null,
          items: JSON.stringify(items),
          diagnosis: diagnosis ?? null,
          notes: notes ?? null,
          ...(durationDays !== undefined ? { durationDays } : {}),
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await recordClinicalVersion(tx, {
        entityType: "prescription",
        entityId: created.id,
        patientId,
        action: "created",
        data: prescriptionSnapshot(created),
        authorId,
      });

      return created;
    });

    logAudit({
      userId: session.user.id!,
      action: "CREATE",
      resource: "prescription",
      resourceId: prescription.id,
      details: { patientId, itemCount: items.length },
      req,
    });

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error) {
    console.error("POST /api/prescriptions error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear receta" },
      { status: 500 }
    );
  }
}
