import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updatePatientSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth-utils";
import {
  evaluatePatientDeletion,
  gatherPatientDeletionFacts,
  isPatientDeletionMode,
  patientDeletionForbiddenReason,
  resolveProfessionalNames,
  type PatientDeletionEvaluation,
} from "@/lib/patient-deletion";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id] — Patient detail
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const patient = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
      include: { os: true },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    console.error("GET /api/patients/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener paciente" },
      { status: 500 }
    );
  }
}

// PUT /api/patients/[id] — Update patient
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const parsed = updatePatientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    const data = parsed.data;

    // Check unique DNI if changing it. `dni` es @unique en DB: un paciente
    // archivado también lo ocupa (sin este chequeo el update daría 500).
    if (data.dni && data.dni !== existing.dni) {
      const duplicate = await prisma.patient.findFirst({
        where: { dni: data.dni, id: { not: id } },
        select: { id: true, deletedAt: true },
      });
      if (duplicate?.deletedAt) {
        return NextResponse.json(
          {
            success: false,
            code: "ARCHIVED_DUPLICATE",
            archivedPatientId: duplicate.id,
            error: "Ya existe un paciente archivado con ese DNI",
          },
          { status: 409 }
        );
      }
      if (duplicate) {
        return NextResponse.json(
          { success: false, code: "DUPLICATE", error: "Ya existe un paciente con ese DNI" },
          { status: 409 }
        );
      }
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        ...data,
        birthDate:
          data.birthDate !== undefined
            ? data.birthDate
              ? new Date(data.birthDate)
              : null
            : undefined,
        consentGivenAt:
          data.consentGivenAt !== undefined
            ? data.consentGivenAt
              ? new Date(data.consentGivenAt)
              : null
            : undefined,
      },
      include: { os: true },
    });

    logAudit({
      userId: session.user.id!,
      action: "UPDATE",
      resource: "patient",
      resourceId: id,
      details: { fields: Object.keys(parsed.data) },
      req,
    });

    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    console.error("PUT /api/patients/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar paciente" },
      { status: 500 }
    );
  }
}

// DELETE /api/patients/[id]?mode=purge|archive (default: archive)
// - purge: borrado físico, solo sin asientos clínicos ni turnos con otros profesionales.
// - archive: baja lógica (deletedAt/deletedById); la historia clínica se conserva.
// Reglas completas en lib/patient-deletion.ts.
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const actorId = session.user.id;

    const { id } = await context.params;

    const mode = req.nextUrl.searchParams.get("mode") ?? "archive";
    if (!isPatientDeletionMode(mode)) {
      return NextResponse.json(
        { success: false, error: "Modo inválido (purge | archive)" },
        { status: 400 }
      );
    }

    const existing = await prisma.patient.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, createdById: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    const role = await getUserRole(actorId);

    // Permiso por rol/autoría antes de mirar datos clínicos.
    const forbidden = patientDeletionForbiddenReason(mode, role, actorId, existing.createdById);
    if (forbidden) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: forbidden },
        { status: 403 }
      );
    }

    // Evaluación + mutación en la misma transacción: acota la ventana en la que
    // un asiento clínico nuevo podría borrarse por cascada en un purge.
    const evaluation: PatientDeletionEvaluation = await prisma.$transaction(async (tx) => {
      const facts = await gatherPatientDeletionFacts(tx, existing);
      const ev = evaluatePatientDeletion({ mode, role, actorId, facts });
      if (ev.outcome !== "allow") return ev;

      if (mode === "purge") {
        await tx.patient.delete({ where: { id } });
      } else {
        await tx.patient.update({
          where: { id },
          data: { deletedAt: new Date(), deletedById: actorId },
        });
      }
      return ev;
    });

    // Roles no clínicos (secretaria) no ven la autoría de asientos clínicos:
    // solo los profesionales que surgen de turnos (que ya ven en la agenda).
    const isClinicalRole = role === "medic" || role === "admin";
    const visibleProfessionalIds = isClinicalRole
      ? evaluation.otherProfessionalIds
      : evaluation.otherShiftProfessionalIds;

    if (evaluation.outcome === "forbidden") {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: evaluation.error },
        { status: 403 }
      );
    }

    if (evaluation.outcome === "blocked") {
      const otherProfessionals = await resolveProfessionalNames(visibleProfessionalIds);
      return NextResponse.json(
        {
          success: false,
          code: evaluation.code,
          error: evaluation.error,
          blockers: {
            clinicalEntries: evaluation.clinicalEntries,
            otherProfessionals,
            futureShiftsWithOthers: evaluation.futureShiftsWithOthers,
            canArchive: evaluation.canArchive,
          },
        },
        { status: 409 }
      );
    }

    logAudit({
      userId: actorId,
      action: "DELETE",
      resource: "patient",
      resourceId: id,
      details:
        mode === "archive" && evaluation.otherProfessionalIds.length > 0
          ? { mode, otherProfessionalIds: evaluation.otherProfessionalIds }
          : { mode },
      req,
    });

    if (mode === "purge") {
      return NextResponse.json({ success: true, data: { id, mode } });
    }

    const otherProfessionals = await resolveProfessionalNames(visibleProfessionalIds);
    const warnings: string[] = [];
    if (otherProfessionals.length > 0) {
      warnings.push(
        `Otros profesionales con historia clínica o turnos de este paciente: ${otherProfessionals
          .map((p) => p.name)
          .join(", ")}.`
      );
    }
    if (evaluation.clinicalEntries > 0) {
      warnings.push(
        "La historia clínica se conserva; el administrador puede restaurar al paciente."
      );
    }
    if (evaluation.ownFutureShifts > 0) {
      warnings.push(
        evaluation.ownFutureShifts === 1
          ? "Tenés 1 turno futuro con este paciente que sigue en la agenda."
          : `Tenés ${evaluation.ownFutureShifts} turnos futuros con este paciente que siguen en la agenda.`
      );
    }

    return NextResponse.json({
      success: true,
      data: { id, mode, warnings, otherProfessionals },
    });
  } catch (error) {
    console.error("DELETE /api/patients/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar paciente" },
      { status: 500 }
    );
  }
}
