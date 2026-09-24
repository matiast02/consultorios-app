import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createEvolutionSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import {
  CLINICAL_FORBIDDEN,
  getClinicalActor,
  grantAuditDetails,
  readScopeForList,
} from "@/lib/clinical-access";
import { recordClinicalVersion, evolutionSnapshot } from "@/lib/clinical-ledger";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id]/evolutions — List evolutions (paginated)
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Lista blanca: solo roles clínicos leen evoluciones.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const { id: patientId } = await context.params;
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search") || "";

    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    // Get clinical record for this patient
    const clinicalRecord = await prisma.clinicalRecord.findUnique({
      where: { patientId },
    });

    if (!clinicalRecord) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    // Médicos: sus evoluciones + las que cubra una concesión vigente. Admin: todas.
    const scope = await readScopeForList(actor, patientId, "evolution");
    const where: Prisma.EvolutionWhereInput = {
      clinicalRecordId: clinicalRecord.id,
      ...scope.where,
    };

    if (search) {
      // AND: el alcance puede traer su propio OR (propias + asientos puntuales).
      where.AND = [
        {
          OR: [
            { diagnosis: { contains: search } },
            { reason: { contains: search } },
            { diagnosisCode: { contains: search } },
          ],
        },
      ];
    }

    const [evolutions, total] = await Promise.all([
      prisma.evolution.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, firstName: true, lastName: true },
          },
          shift: {
            select: { id: true, start: true, end: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.evolution.count({ where }),
    ]);

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "evolution",
      resourceId: patientId,
      details: { list: true, count: evolutions.length, ...grantAuditDetails(scope.grantId) },
      req,
    });

    return NextResponse.json({
      success: true,
      data: evolutions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/patients/[id]/evolutions error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener evoluciones" },
      { status: 500 }
    );
  }
}

// POST /api/patients/[id]/evolutions — Create evolution (medics only)
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Solo médicos registran evoluciones (el admin custodia, no escribe HC).
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }
    if (!actor.isMedic) {
      return NextResponse.json(
        { success: false, error: "Solo profesionales médicos pueden registrar evoluciones" },
        { status: 403 }
      );
    }

    const { id: patientId } = await context.params;
    const body = await req.json();
    const parsed = createEvolutionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    // Get or create clinical record for this patient
    const clinicalRecord = await prisma.clinicalRecord.upsert({
      where: { patientId },
      update: {},
      create: { patientId },
    });

    // If shiftId provided, verify it exists and belongs to this patient
    if (parsed.data.shiftId) {
      const shift = await prisma.shift.findFirst({
        where: { id: parsed.data.shiftId, patientId },
      });

      if (!shift) {
        return NextResponse.json(
          { success: false, error: "Turno no encontrado para este paciente" },
          { status: 404 }
        );
      }

      // Check if shift already has an evolution
      const existingEvolution = await prisma.evolution.findUnique({
        where: { shiftId: parsed.data.shiftId },
      });

      if (existingEvolution) {
        return NextResponse.json(
          { success: false, error: "Este turno ya tiene una evolución asociada" },
          { status: 409 }
        );
      }
    }

    const authorId = session.user.id;
    const evolution = await prisma.$transaction(async (tx) => {
      const created = await tx.evolution.create({
        data: {
          clinicalRecordId: clinicalRecord.id,
          userId: authorId,
          shiftId: parsed.data.shiftId ?? null,
          reason: parsed.data.reason ?? null,
          physicalExam: parsed.data.physicalExam ?? null,
          diagnosis: parsed.data.diagnosis ?? null,
          diagnosisCode: parsed.data.diagnosisCode ?? null,
          treatment: parsed.data.treatment ?? null,
          indications: parsed.data.indications ?? null,
          notes: parsed.data.notes ?? null,
        },
        include: {
          user: {
            select: { id: true, name: true, firstName: true, lastName: true },
          },
          shift: {
            select: { id: true, start: true, end: true, status: true },
          },
        },
      });

      // Immutable ledger entry (v1).
      await recordClinicalVersion(tx, {
        entityType: "evolution",
        entityId: created.id,
        patientId,
        action: "created",
        data: evolutionSnapshot(created),
        authorId,
      });

      return created;
    });

    logAudit({
      userId: session.user.id,
      action: "CREATE",
      resource: "evolution",
      resourceId: evolution.id,
      // Sin contenido clínico en audit: el diagnóstico queda en el ledger cifrado.
      details: { patientId },
      req,
    });

    return NextResponse.json({ success: true, data: evolution }, { status: 201 });
  } catch (error) {
    console.error("POST /api/patients/[id]/evolutions error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear evolución" },
      { status: 500 }
    );
  }
}
