import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createEvolutionSchema } from "@/lib/validations";
import { isMedic } from "@/lib/auth-utils";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id]/evolutions — List evolutions (paginated)
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
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

    const where: Record<string, unknown> = {
      clinicalRecordId: clinicalRecord.id,
    };

    // Medics can only see their own evolutions
    const currentUserId = session.user?.id;
    if (currentUserId && await isMedic(currentUserId)) {
      where.userId = currentUserId;
    }

    if (search) {
      where.OR = [
        { diagnosis: { contains: search } },
        { reason: { contains: search } },
        { diagnosisCode: { contains: search } },
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

// POST /api/patients/[id]/evolutions — Create evolution
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
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

    const evolution = await prisma.evolution.create({
      data: {
        clinicalRecordId: clinicalRecord.id,
        userId: session.user.id,
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

    return NextResponse.json({ success: true, data: evolution }, { status: 201 });
  } catch (error) {
    console.error("POST /api/patients/[id]/evolutions error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear evolución" },
      { status: 500 }
    );
  }
}
