// Helpers de las rutas de concesiones (app/api/clinical-access-grants/**):
// include común, serialización al contrato y resolución de "tratante" en lote.
// La política de acceso vive en lib/clinical-access.ts.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  activeGrantWhere,
  effectiveGrantStatus,
  grantPermissions,
  isGrantActive,
  parseJsonStringArray,
  treatedPatientWhere,
  type ClinicalActor,
  type GrantPermissions,
} from "@/lib/clinical-access";
import type { GrantStatusValue } from "@/lib/clinical-grants-shared";

export const GRANT_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  grantedTo: { select: { id: true, name: true, firstName: true, lastName: true } },
} as const satisfies Prisma.ClinicalAccessGrantInclude;

export type GrantRow = Prisma.ClinicalAccessGrantGetPayload<{ include: typeof GRANT_INCLUDE }>;

export interface UserRef {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
}

/** Filtro por estado EFECTIVO (ACTIVE = vigente; EXPIRED incluye ACTIVE vencidas). */
export function grantStatusWhere(
  status: GrantStatusValue,
  now: Date = new Date(),
): Prisma.ClinicalAccessGrantWhereInput {
  if (status === "ACTIVE") return activeGrantWhere(now);
  if (status === "EXPIRED") {
    return { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }] };
  }
  return { status };
}

/** Nombres de quienes decidieron / revocaron (no hay relación Prisma para esos ids). */
export async function loadUserRefs(
  ids: Array<string | null | undefined>,
): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, firstName: true, lastName: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

/**
 * ¿De cuáles de estos pacientes es tratante el actor? Una sola query
 * relacional (misma regla que medicHasRelationship). Admin: de todos.
 */
export async function treatingPatientIds(
  actor: ClinicalActor,
  patientIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(patientIds)];
  if (actor.isAdmin) return new Set(unique);
  if (!actor.isMedic || unique.length === 0) return new Set();
  const rows = await prisma.patient.findMany({
    where: { id: { in: unique }, ...treatedPatientWhere(actor.userId) },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export interface SerializedGrant {
  id: string;
  patientId: string;
  patient: GrantRow["patient"];
  grantedToUserId: string;
  grantedTo: GrantRow["grantedTo"];
  requestedById: string;
  decidedById: string | null;
  decidedBy: UserRef | null;
  revokedById: string | null;
  revokedBy: UserRef | null;
  status: GrantStatusValue;
  isActive: boolean;
  scope: GrantRow["scope"];
  sections: string[];
  entryIds: string[];
  reason: string;
  consentType: GrantRow["consentType"];
  consentEvidence: string | null;
  consentAt: Date | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: GrantPermissions;
}

/** Forma del contrato (clinical-access-grants.yaml → ClinicalAccessGrant). */
export function serializeGrant(
  g: GrantRow,
  actor: ClinicalActor,
  isTreating: boolean,
  users: Map<string, UserRef>,
  now: Date = new Date(),
): SerializedGrant {
  const status = effectiveGrantStatus(g, now);
  return {
    id: g.id,
    patientId: g.patientId,
    patient: g.patient,
    grantedToUserId: g.grantedToUserId,
    grantedTo: g.grantedTo,
    requestedById: g.requestedById,
    decidedById: g.decidedById,
    decidedBy: g.decidedById ? users.get(g.decidedById) ?? null : null,
    revokedById: g.revokedById,
    revokedBy: g.revokedById ? users.get(g.revokedById) ?? null : null,
    status,
    isActive: isGrantActive(g, now),
    scope: g.scope,
    sections: parseJsonStringArray(g.sections),
    entryIds: parseJsonStringArray(g.entryIds),
    reason: g.reason,
    consentType: g.consentType,
    consentEvidence: g.consentEvidence,
    consentAt: g.consentAt,
    startsAt: g.startsAt,
    expiresAt: g.expiresAt,
    decidedAt: g.decidedAt,
    decisionNote: g.decisionNote,
    revokedAt: g.revokedAt,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    permissions: grantPermissions(
      actor,
      { status, grantedToUserId: g.grantedToUserId, decidedById: g.decidedById },
      isTreating,
    ),
  };
}
