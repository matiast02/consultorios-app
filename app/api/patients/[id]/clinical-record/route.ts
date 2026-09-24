import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateClinicalRecordSchema } from "@/lib/validations";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { recordClinicalVersion, clinicalRecordSnapshot } from "@/lib/clinical-ledger";
import {
  CLINICAL_FORBIDDEN,
  entryScope,
  getClinicalActor,
  medicHasRelationship,
} from "@/lib/clinical-access";

type RouteContext = { params: Promise<{ id: string }> };

// Vista redactada por LISTA BLANCA: solo estos campos salen con su valor real.
// Todo otro campo de ClinicalRecord (incluidos los que se agreguen en el futuro)
// se devuelve en null. Las alergias estructuradas se exponen por seguridad del
// paciente (alerta en recepción / médico sin relación): decisión de producto.
const REDACTED_SELECT = {
  id: true,
  patientId: true,
  structuredAllergies: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ClinicalRecordSelect;

type RedactedRecord = Prisma.ClinicalRecordGetPayload<{ select: typeof REDACTED_SELECT }>;

function redactedView(rec: RedactedRecord): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const field of Object.values(Prisma.ClinicalRecordScalarFieldEnum)) {
    view[field] = null;
  }
  // Se copian solo las claves de la lista blanca (no se esparce `rec`), así un
  // select mal armado nunca filtra columnas extra.
  for (const key of Object.keys(REDACTED_SELECT) as (keyof RedactedRecord)[]) {
    view[key] = rec[key];
  }
  view.evolutions = [];
  return view;
}

// GET /api/patients/[id]/clinical-record — Get or create clinical record
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { id } = await context.params;
    const actor = await getClinicalActor(userId);

    if (!actor) {
      // Secretarias: vista redactada (solo alergias estructuradas, dato de
      // seguridad). Cualquier otro rol no clínico: sin acceso.
      if ((await getUserRole(userId)) !== "secretary") {
        return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
      }
      const patient = await prisma.patient.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!patient) {
        return NextResponse.json(
          { success: false, error: "Paciente no encontrado" },
          { status: 404 }
        );
      }
      const rec = await prisma.clinicalRecord.findUnique({
        where: { patientId: id },
        select: REDACTED_SELECT,
      });
      return NextResponse.json({ success: true, data: rec ? redactedView(rec) : null });
    }

    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    // Médico sin relación clínica con el paciente: ficha vacía (lista blanca).
    if (!(await medicHasRelationship(actor, id))) {
      const rec = await prisma.clinicalRecord.upsert({
        where: { patientId: id },
        update: {},
        create: { patientId: id },
        select: REDACTED_SELECT,
      });
      return NextResponse.json({ success: true, data: redactedView(rec) });
    }

    // Upsert: get existing or create empty record
    const clinicalRecord = await prisma.clinicalRecord.upsert({
      where: { patientId: id },
      update: {},
      create: { patientId: id },
      include: {
        evolutions: {
          // Médicos: solo sus evoluciones. Admin: todas.
          where: entryScope(actor),
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { id: true, name: true, firstName: true, lastName: true },
            },
            shift: {
              select: { id: true, start: true, end: true, status: true },
            },
          },
        },
      },
    });

    // Log VIEW_SENSITIVE if record has meaningful data
    const hasData =
      clinicalRecord.evolutions.length > 0 ||
      clinicalRecord.bloodType ||
      clinicalRecord.allergies ||
      clinicalRecord.personalHistory ||
      clinicalRecord.familyHistory ||
      clinicalRecord.currentMedication ||
      clinicalRecord.notes;

    if (hasData) {
      logAudit({
        userId,
        action: "VIEW_SENSITIVE",
        resource: "clinical_record",
        resourceId: clinicalRecord.id,
        req,
      });
    }

    return NextResponse.json({ success: true, data: clinicalRecord });
  } catch (error) {
    console.error("GET /api/patients/[id]/clinical-record error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener historia clínica" },
      { status: 500 }
    );
  }
}

// PUT /api/patients/[id]/clinical-record — Update clinical record fields
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Solo roles clínicos (lista blanca) editan la historia clínica.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateClinicalRecordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    // Médicos: solo con relación clínica con el paciente (admin siempre).
    if (!(await medicHasRelationship(actor, id))) {
      return NextResponse.json(
        { success: false, error: "No tenés permisos para editar esta historia clínica" },
        { status: 403 }
      );
    }

    // Transform schema-level shapes into Prisma-compatible shapes
    const { structuredAllergies, bloodType, ...rest } = parsed.data;
    const dataForPrisma = {
      ...rest,
      ...(bloodType !== undefined
        ? { bloodType: bloodType === "" ? null : bloodType }
        : {}),
      ...(structuredAllergies !== undefined
        ? {
            structuredAllergies:
              structuredAllergies === null || structuredAllergies.length === 0
                ? null
                : JSON.stringify(structuredAllergies),
          }
        : {}),
    };

    const authorId = session.user.id;
    const existingRecord = await prisma.clinicalRecord.findUnique({
      where: { patientId: id },
      select: { id: true },
    });

    // Upsert the clinical record + append an immutable version snapshot.
    const clinicalRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.clinicalRecord.upsert({
        where: { patientId: id },
        update: dataForPrisma,
        create: {
          patientId: id,
          ...dataForPrisma,
        },
      });

      await recordClinicalVersion(tx, {
        entityType: "clinical_record",
        entityId: record.id,
        patientId: id,
        action: existingRecord ? "corrected" : "created",
        data: clinicalRecordSnapshot(record),
        authorId,
      });

      return record;
    });

    logAudit({
      userId: session.user.id!,
      action: "UPDATE",
      resource: "clinical_record",
      resourceId: clinicalRecord.id,
      req,
    });

    return NextResponse.json({ success: true, data: clinicalRecord });
  } catch (error) {
    console.error("PUT /api/patients/[id]/clinical-record error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar historia clínica" },
      { status: 500 }
    );
  }
}
