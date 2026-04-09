import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateClinicalRecordSchema } from "@/lib/validations";
import { isMedic } from "@/lib/auth-utils";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id]/clinical-record — Get or create clinical record
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

    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    const currentUserId = session.user.id;
    const userIsMedic = await isMedic(currentUserId);

    // Upsert: get existing or create empty record
    const clinicalRecord = await prisma.clinicalRecord.upsert({
      where: { patientId: id },
      update: {},
      create: { patientId: id },
      include: {
        evolutions: {
          // Medics only see their own evolutions
          ...(userIsMedic ? { where: { userId: currentUserId } } : {}),
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

    // For medics: hide clinical record fields they didn't author
    // They can only see the ficha if they have at least one evolution
    if (userIsMedic && clinicalRecord.evolutions.length === 0) {
      // Check if this medic has ever created an evolution for this patient
      const hasEvolutions = await prisma.evolution.count({
        where: { clinicalRecordId: clinicalRecord.id, userId: currentUserId },
      });
      if (hasEvolutions === 0) {
        // Return empty record — medic hasn't written anything for this patient
        return NextResponse.json({
          success: true,
          data: {
            ...clinicalRecord,
            bloodType: null,
            allergies: null,
            personalHistory: null,
            familyHistory: null,
            currentMedication: null,
            notes: null,
          },
        });
      }
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
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
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    // Medics can only edit if they have evolutions for this patient
    const currentUserId = session.user.id;
    if (await isMedic(currentUserId)) {
      const existingRecord = await prisma.clinicalRecord.findUnique({
        where: { patientId: id },
      });
      if (existingRecord) {
        const hasEvolutions = await prisma.evolution.count({
          where: { clinicalRecordId: existingRecord.id, userId: currentUserId },
        });
        if (hasEvolutions === 0) {
          return NextResponse.json(
            { success: false, error: "No tenés permisos para editar esta historia clínica" },
            { status: 403 }
          );
        }
      }
    }

    // Upsert the clinical record with provided data
    const clinicalRecord = await prisma.clinicalRecord.upsert({
      where: { patientId: id },
      update: parsed.data,
      create: {
        patientId: id,
        ...parsed.data,
      },
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
