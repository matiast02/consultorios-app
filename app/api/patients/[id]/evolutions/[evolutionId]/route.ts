import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateEvolutionSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string; evolutionId: string }> };

// GET /api/patients/[id]/evolutions/[evolutionId] — Get single evolution
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: patientId, evolutionId } = await context.params;

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

    const evolution = await prisma.evolution.findFirst({
      where: {
        id: evolutionId,
        clinicalRecord: { patientId },
      },
      include: {
        user: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
        shift: {
          select: { id: true, start: true, end: true, status: true },
        },
        clinicalRecord: {
          select: { id: true, patientId: true },
        },
      },
    });

    if (!evolution) {
      return NextResponse.json(
        { success: false, error: "Evolución no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: evolution });
  } catch (error) {
    console.error("GET /api/patients/[id]/evolutions/[evolutionId] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener evolución" },
      { status: 500 }
    );
  }
}

// PUT /api/patients/[id]/evolutions/[evolutionId] — Update evolution (only by creator)
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: patientId, evolutionId } = await context.params;
    const body = await req.json();
    const parsed = updateEvolutionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const evolution = await prisma.evolution.findFirst({
      where: {
        id: evolutionId,
        clinicalRecord: { patientId },
      },
    });

    if (!evolution) {
      return NextResponse.json(
        { success: false, error: "Evolución no encontrada" },
        { status: 404 }
      );
    }

    // Only the creator can update
    if (evolution.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Solo el médico que creó la evolución puede editarla" },
        { status: 403 }
      );
    }

    // If changing shiftId, validate the new shift
    if (parsed.data.shiftId && parsed.data.shiftId !== evolution.shiftId) {
      const shift = await prisma.shift.findFirst({
        where: { id: parsed.data.shiftId, patientId },
      });

      if (!shift) {
        return NextResponse.json(
          { success: false, error: "Turno no encontrado para este paciente" },
          { status: 404 }
        );
      }

      const existingEvolution = await prisma.evolution.findUnique({
        where: { shiftId: parsed.data.shiftId },
      });

      if (existingEvolution && existingEvolution.id !== evolutionId) {
        return NextResponse.json(
          { success: false, error: "Este turno ya tiene una evolución asociada" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.evolution.update({
      where: { id: evolutionId },
      data: parsed.data,
      include: {
        user: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
        shift: {
          select: { id: true, start: true, end: true, status: true },
        },
      },
    });

    logAudit({
      userId: session.user.id,
      action: "UPDATE",
      resource: "evolution",
      resourceId: evolutionId,
      req,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PUT /api/patients/[id]/evolutions/[evolutionId] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar evolución" },
      { status: 500 }
    );
  }
}

// DELETE /api/patients/[id]/evolutions/[evolutionId] — Delete evolution (only by creator)
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: patientId, evolutionId } = await context.params;

    const evolution = await prisma.evolution.findFirst({
      where: {
        id: evolutionId,
        clinicalRecord: { patientId },
      },
    });

    if (!evolution) {
      return NextResponse.json(
        { success: false, error: "Evolución no encontrada" },
        { status: 404 }
      );
    }

    // Only the creator can delete
    if (evolution.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Solo el médico que creó la evolución puede eliminarla" },
        { status: 403 }
      );
    }

    await prisma.evolution.delete({ where: { id: evolutionId } });

    logAudit({
      userId: session.user.id,
      action: "DELETE",
      resource: "evolution",
      resourceId: evolutionId,
      req,
    });

    return NextResponse.json({ success: true, data: { id: evolutionId } });
  } catch (error) {
    console.error("DELETE /api/patients/[id]/evolutions/[evolutionId] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar evolución" },
      { status: 500 }
    );
  }
}
