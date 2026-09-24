import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  CLINICAL_FORBIDDEN,
  getClinicalActor,
  parseJsonStringArray,
  recordSections,
} from "@/lib/clinical-access";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/patients/[id]/clinical-access — estado de acceso a la HC del
// usuario actual (banner, secciones visibles, panel de decisiones).
// Contrato: lib/openapi/paths/grants-hc-copy.ts (ClinicalAccessStatus).
// No devuelve datos clínicos (sin VIEW_SENSITIVE).
export async function GET(_req: Request, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const { id: patientId } = await context.params;
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Paciente no encontrado" }, { status: 404 });
    }

    const access = await recordSections(actor, patientId);
    const canDecide = access.hasRelationship; // admin o tratante

    const [pending, pendingToDecide] = await Promise.all([
      actor.isMedic
        ? prisma.clinicalAccessGrant.findFirst({
            where: { grantedToUserId: actor.userId, patientId, status: "PENDING" },
            orderBy: { createdAt: "desc" },
            select: { id: true, scope: true, sections: true, createdAt: true },
          })
        : Promise.resolve(null),
      canDecide
        ? prisma.clinicalAccessGrant.count({
            where: { patientId, status: "PENDING", grantedToUserId: { not: actor.userId } },
          })
        : Promise.resolve(0),
    ]);

    const grant = access.grant;
    return NextResponse.json({
      success: true,
      data: {
        isAdmin: actor.isAdmin,
        hasRelationship: access.hasRelationship,
        canDecide,
        canRequest: actor.isMedic && !access.hasRelationship && !grant && !pending,
        record: { full: access.full, sections: access.sections },
        activeGrant: grant
          ? {
              id: grant.id,
              scope: grant.scope,
              sections: grant.sections,
              entryIds: grant.entryIds,
              startsAt: grant.startsAt,
              expiresAt: grant.expiresAt,
            }
          : null,
        pendingRequest: pending
          ? {
              id: pending.id,
              scope: pending.scope,
              sections: parseJsonStringArray(pending.sections),
              createdAt: pending.createdAt,
            }
          : null,
        pendingToDecide,
      },
    });
  } catch (error) {
    console.error("GET /api/patients/[id]/clinical-access error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener el estado de acceso" },
      { status: 500 },
    );
  }
}
