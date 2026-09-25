import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit, type AuditAction } from "@/lib/audit";
import { accessGrantActionSchema } from "@/lib/validations";
import {
  CLINICAL_FORBIDDEN,
  activeGrantWhere,
  effectiveGrantStatus,
  getClinicalActor,
  grantPermissions,
  medicHasRelationship,
} from "@/lib/clinical-access";
import { GRANT_DEFAULT_DAYS } from "@/lib/clinical-grants-shared";
import { GRANT_INCLUDE, loadUserRefs, serializeGrant } from "@/lib/clinical-access-grants";

// Contrato: lib/openapi/paths/grants-hc-copy.ts
//
// | action  | estado  | quién                                 | → estado  | audit          |
// |---------|---------|---------------------------------------|-----------|----------------|
// | approve | PENDING | admin o tratante (no el beneficiario) | ACTIVE    | GRANT_ACCESS   |
// | reject  | PENDING | admin o tratante (no el beneficiario) | REJECTED  | REQUEST_ACCESS |
// | revoke  | ACTIVE  | admin, tratante o quien la aprobó     | REVOKED   | GRANT_ACCESS   |
// | cancel  | PENDING | beneficiario                          | REJECTED  | REQUEST_ACCESS |
// | cancel  | ACTIVE  | beneficiario                          | REVOKED   | GRANT_ACCESS   |

type RouteContext = { params: Promise<{ id: string }> };

const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (status: number, error: string) =>
  NextResponse.json({ success: false, error }, { status });

// PATCH /api/clinical-access-grants/[id]
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return fail(401, "No autorizado");
    const actor = await getClinicalActor(session.user.id);
    if (!actor) return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });

    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    const parsed = accessGrantActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const grant = await prisma.clinicalAccessGrant.findUnique({ where: { id }, include: GRANT_INCLUDE });
    if (!grant) return fail(404, "Solicitud no encontrada");

    const own = grant.grantedToUserId === actor.userId;
    const isTreating = await medicHasRelationship(actor, grant.patientId);
    // 404 (no 403) si ni siquiera puede verla: no revelar su existencia.
    if (!actor.isAdmin && !own && !isTreating && grant.decidedById !== actor.userId) {
      return fail(404, "Solicitud no encontrada");
    }

    const now = new Date();
    const status = effectiveGrantStatus(grant, now);
    const perms = grantPermissions(
      actor,
      { status, grantedToUserId: grant.grantedToUserId, decidedById: grant.decidedById },
      isTreating,
    );

    // Cada rama define la transición; el update es condicional al estado
    // leído (updateMany + where status) para que dos decisiones concurrentes
    // no se pisen: la segunda recibe 409.
    let fromStatus: "PENDING" | "ACTIVE";
    let data: Prisma.ClinicalAccessGrantUpdateManyMutationInput;
    let audit: { action: AuditAction; details: Record<string, unknown> };
    const base = { patientId: grant.patientId, grantedToUserId: grant.grantedToUserId };

    switch (input.action) {
      case "approve":
      case "reject": {
        if (status !== "PENDING") return fail(409, "La solicitud ya fue resuelta");
        if (own) return fail(403, "No podés decidir tu propia solicitud");
        if (!perms[input.action]) {
          return fail(403, "Solo un médico tratante del paciente o el administrador pueden decidirla");
        }
        fromStatus = "PENDING";
        if (input.action === "reject") {
          data = {
            status: "REJECTED",
            decidedById: actor.userId,
            decidedAt: now,
            decisionNote: input.decisionNote,
          };
          audit = { action: "REQUEST_ACCESS", details: { action: "rejected", ...base } };
          break;
        }

        const patient = await prisma.patient.findFirst({
          where: { id: grant.patientId, deletedAt: null },
          select: { id: true },
        });
        if (!patient) return fail(409, "El paciente está archivado: no se puede conceder acceso");
        const other = await prisma.clinicalAccessGrant.findFirst({
          where: {
            id: { not: grant.id },
            grantedToUserId: grant.grantedToUserId,
            patientId: grant.patientId,
            ...activeGrantWhere(now),
          },
          select: { id: true },
        });
        if (other) return fail(409, "El médico ya tiene un acceso vigente a este paciente");

        const days = input.days ?? GRANT_DEFAULT_DAYS;
        const expiresAt = new Date(now.getTime() + days * DAY_MS);
        data = {
          status: "ACTIVE",
          decidedById: actor.userId,
          decidedAt: now,
          consentType: input.consentType,
          consentEvidence: input.consentEvidence?.trim() || null,
          consentAt: input.consentAt ?? now,
          startsAt: now,
          expiresAt,
        };
        audit = {
          action: "GRANT_ACCESS",
          details: {
            action: "approved",
            ...base,
            scope: grant.scope,
            consentType: input.consentType,
            days,
            expiresAt: expiresAt.toISOString(),
          },
        };
        break;
      }

      case "revoke": {
        if (status !== "ACTIVE") return fail(409, "La concesión no está vigente");
        if (own) return fail(403, "Para renunciar a tu propio acceso usá cancelar");
        if (!perms.revoke) {
          return fail(403, "Solo un médico tratante del paciente o el administrador pueden revocarla");
        }
        fromStatus = "ACTIVE";
        data = {
          status: "REVOKED",
          revokedAt: now,
          revokedById: actor.userId,
          ...(input.decisionNote ? { decisionNote: input.decisionNote } : {}),
        };
        audit = { action: "GRANT_ACCESS", details: { action: "revoked", ...base } };
        break;
      }

      case "cancel": {
        if (!own) return fail(403, "Solo quien pidió el acceso puede cancelarlo");
        if (!perms.cancel) return fail(409, "La solicitud ya no está pendiente ni vigente");
        if (status === "PENDING") {
          fromStatus = "PENDING";
          data = {
            status: "REJECTED",
            decidedById: actor.userId,
            decidedAt: now,
            decisionNote: "Cancelada por el solicitante",
          };
          audit = { action: "REQUEST_ACCESS", details: { action: "cancelled", ...base } };
        } else {
          fromStatus = "ACTIVE";
          data = { status: "REVOKED", revokedAt: now, revokedById: actor.userId };
          audit = { action: "GRANT_ACCESS", details: { action: "revoked", bySelf: true, ...base } };
        }
        break;
      }
    }

    const { count } = await prisma.clinicalAccessGrant.updateMany({
      where: { id: grant.id, status: fromStatus },
      data,
    });
    if (count !== 1) return fail(409, "La solicitud cambió de estado mientras la procesabas. Recargá la página.");

    logAudit({
      userId: actor.userId,
      action: audit.action,
      resource: "clinical_access_grant",
      resourceId: grant.id,
      // Sin textos libres (motivo, evidencia, nota): quedan cifrados en la concesión.
      details: audit.details,
      req,
    });

    const updated = await prisma.clinicalAccessGrant.findUnique({
      where: { id: grant.id },
      include: GRANT_INCLUDE,
    });
    if (!updated) return fail(404, "Solicitud no encontrada");
    const users = await loadUserRefs([updated.decidedById, updated.revokedById]);
    return NextResponse.json({
      success: true,
      data: serializeGrant(updated, actor, isTreating, users),
    });
  } catch (error) {
    console.error("PATCH /api/clinical-access-grants/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar la solicitud de acceso" },
      { status: 500 },
    );
  }
}
