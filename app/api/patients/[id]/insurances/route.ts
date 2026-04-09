import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id]/insurances — List patient's insurances
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

    const patientInsurances = await prisma.patientInsurance.findMany({
      where: { patientId: id },
      include: { healthInsurance: true },
    });

    const data = patientInsurances.map((pi) => ({
      id: pi.id,
      healthInsuranceId: pi.healthInsuranceId,
      healthInsurance: pi.healthInsurance,
      affiliateNumber: pi.affiliateNumber,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/patients/[id]/insurances error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener obras sociales del paciente" },
      { status: 500 }
    );
  }
}

// POST /api/patients/[id]/insurances — Add an insurance to patient
export async function POST(req: NextRequest, context: RouteContext) {
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
    const { healthInsuranceId, affiliateNumber } = body;

    if (!healthInsuranceId || typeof healthInsuranceId !== "string") {
      return NextResponse.json(
        { success: false, error: "healthInsuranceId es requerido" },
        { status: 400 }
      );
    }

    // Check patient exists
    const patient = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    // Check health insurance exists
    const insurance = await prisma.healthInsurance.findUnique({
      where: { id: healthInsuranceId },
    });
    if (!insurance) {
      return NextResponse.json(
        { success: false, error: "Obra social no encontrada" },
        { status: 404 }
      );
    }

    // Check unique constraint
    const existing = await prisma.patientInsurance.findUnique({
      where: {
        patientId_healthInsuranceId: {
          patientId: id,
          healthInsuranceId,
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "El paciente ya tiene esta obra social asignada" },
        { status: 409 }
      );
    }

    const patientInsurance = await prisma.patientInsurance.create({
      data: {
        patientId: id,
        healthInsuranceId,
        affiliateNumber: affiliateNumber ?? null,
      },
      include: { healthInsurance: true },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: patientInsurance.id,
          healthInsuranceId: patientInsurance.healthInsuranceId,
          healthInsurance: patientInsurance.healthInsurance,
          affiliateNumber: patientInsurance.affiliateNumber,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/patients/[id]/insurances error:", error);
    return NextResponse.json(
      { success: false, error: "Error al agregar obra social al paciente" },
      { status: 500 }
    );
  }
}

// DELETE /api/patients/[id]/insurances — Remove insurance from patient
export async function DELETE(req: NextRequest, context: RouteContext) {
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
    const { healthInsuranceId } = body;

    if (!healthInsuranceId || typeof healthInsuranceId !== "string") {
      return NextResponse.json(
        { success: false, error: "healthInsuranceId es requerido" },
        { status: 400 }
      );
    }

    const existing = await prisma.patientInsurance.findUnique({
      where: {
        patientId_healthInsuranceId: {
          patientId: id,
          healthInsuranceId,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "El paciente no tiene esta obra social asignada" },
        { status: 404 }
      );
    }

    await prisma.patientInsurance.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true, data: { id: existing.id } });
  } catch (error) {
    console.error("DELETE /api/patients/[id]/insurances error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar obra social del paciente" },
      { status: 500 }
    );
  }
}
