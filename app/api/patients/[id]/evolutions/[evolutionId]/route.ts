import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateEvolutionSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { isMedic, isSecretary } from "@/lib/auth-utils";
import { recordClinicalVersion, evolutionSnapshot } from "@/lib/clinical-ledger";

type RouteContext = { params: Promise<{ id: string; evolutionId: string }> };

// GET /api/patients/[id]/evolutions/[evolutionId] — Get single evolution
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Secretaries cannot read evolutions (clinical data) — mirror the list route.
    if (await isSecretary(session.user.id)) {
      return NextResponse.json(
        { success: false, error: "Sin acceso a historia clínica" },
        { status: 403 }
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
        // Medics can only read their own evolutions (admins see all).
        ...((await isMedic(session.user.id)) ? { userId: session.user.id } : {}),
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
    // Correction reason is tracked in the ledger, separate from the clinical fields.
    const correctionReason =
      typeof body?.correctionReason === "string" ? body.correctionReason : null;
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

    // Annulled entries are immutable.
    if (evolution.annulledAt) {
      return NextResponse.json(
        { success: false, error: "No se puede editar una evolución anulada" },
        { status: 409 }
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

    const authorId = session.user.id;
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.evolution.update({
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

      // Immutable correction version (original snapshot is preserved).
      await recordClinicalVersion(tx, {
        entityType: "evolution",
        entityId: evolutionId,
        patientId,
        action: "corrected",
        data: evolutionSnapshot(next),
        authorId,
        reason: correctionReason,
      });

      return next;
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

// DELETE /api/patients/[id]/evolutions/[evolutionId] — Annul evolution (creator only).
// Inalterabilidad: no se borra físicamente; se marca como anulada y queda en el ledger.
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
    const body = await req.json().catch(() => ({}));
    const annulReason =
      typeof body?.annulReason === "string" ? body.annulReason.trim() : "";

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

    // Only the creator can annul
    if (evolution.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Solo el médico que creó la evolución puede anularla" },
        { status: 403 }
      );
    }

    if (evolution.annulledAt) {
      return NextResponse.json(
        { success: false, error: "La evolución ya está anulada" },
        { status: 409 }
      );
    }

    if (!annulReason) {
      return NextResponse.json(
        { success: false, error: "Se requiere un motivo para anular la evolución" },
        { status: 400 }
      );
    }

    const authorId = session.user.id;
    await prisma.$transaction(async (tx) => {
      await tx.evolution.update({
        where: { id: evolutionId },
        data: {
          annulledAt: new Date(),
          annulReason,
          annulledById: authorId,
        },
      });

      await recordClinicalVersion(tx, {
        entityType: "evolution",
        entityId: evolutionId,
        patientId,
        action: "annulled",
        data: evolutionSnapshot(evolution),
        authorId,
        reason: annulReason,
      });
    });

    logAudit({
      userId: session.user.id,
      action: "DELETE",
      resource: "evolution",
      resourceId: evolutionId,
      details: { annulled: true, reason: annulReason },
      req,
    });

    return NextResponse.json({ success: true, data: { id: evolutionId, annulled: true } });
  } catch (error) {
    console.error("DELETE /api/patients/[id]/evolutions/[evolutionId] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al anular evolución" },
      { status: 500 }
    );
  }
}
