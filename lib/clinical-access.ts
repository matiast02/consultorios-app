// Control de acceso a datos clínicos (historia clínica, evoluciones, recetas,
// órdenes de estudio, planes alimentarios, ledger).
//
// Política (Ley 25.326 arts. 7-10, Ley 26.529):
// - Solo roles clínicos (medic) y admin pueden leer o escribir datos clínicos.
//   Secretaria, usuarios sin rol o roles desconocidos: nunca (lista blanca).
// - Un médico ve la ficha clínica de un paciente solo si tiene al menos un
//   asiento propio con ese paciente; y ve/edita/anula únicamente sus asientos.
// - El admin tiene acceso completo por diseño (custodio de la HC), siempre
//   auditado por quien llama (VIEW_SENSITIVE).
//
// Fase 3 — concesiones (`ClinicalAccessGrant`, Ley 26.529 art. 19 inc. d):
// - Un médico sin relación puede recibir una concesión consentida, acotada en
//   alcance y tiempo. Con una concesión VIGENTE lee (nunca escribe) lo que el
//   alcance cubre: FULL = ficha completa + todos los asientos; PARTIAL = las
//   secciones listadas (ver RECORD_SECTION_FIELDS / ENTRY_KIND_SECTION en
//   lib/clinical-grants-shared.ts) y/o los asientos puntuales de `entryIds`.
// - LECTURA: `canReadEntry`, `readScopeForList`, `recordSections` (async,
//   consultan la concesión). Cada lectura bajo concesión la audita la ruta con
//   VIEW_SENSITIVE + `details.grantId`.
// - ESCRITURA: `canAccessEntry` y `medicHasRelationship` NO consideran
//   concesiones a propósito: editar/anular sigue siendo solo del autor y editar
//   la ficha solo del tratante (o admin).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import {
  ENTRY_KIND_SECTION,
  RECORD_SECTIONS,
  RECORD_SECTION_FIELDS,
  isGrantSection,
  isRecordSection,
  type EntryKind,
  type GrantScopeValue,
  type GrantSection,
  type GrantStatusValue,
  type RecordSection,
} from "@/lib/clinical-grants-shared";

export type { EntryKind, GrantSection, RecordSection } from "@/lib/clinical-grants-shared";

export const CLINICAL_ROLES = ["medic", "admin"] as const;
export type ClinicalRole = (typeof CLINICAL_ROLES)[number];

export interface ClinicalActor {
  userId: string;
  role: ClinicalRole;
  isAdmin: boolean;
  isMedic: boolean;
}

export function isClinicalRole(role: string | null | undefined): role is ClinicalRole {
  return role === "medic" || role === "admin";
}

/**
 * Resuelve el actor clínico. Devuelve null si el rol no está en la lista blanca
 * (secretaria, sin rol, desconocido): la ruta debe responder 403.
 */
export async function getClinicalActor(userId: string): Promise<ClinicalActor | null> {
  const role = await getUserRole(userId);
  if (!isClinicalRole(role)) return null;
  return { userId, role, isAdmin: role === "admin", isMedic: role === "medic" };
}

/**
 * ¿El médico tiene relación clínica con el paciente (es "tratante")? True si
 * tiene al menos un asiento propio (evolución, receta, orden o plan). El admin
 * siempre. NO considera concesiones: habilita EDITAR la ficha y DECIDIR
 * concesiones, cosas que una concesión nunca otorga.
 */
export async function medicHasRelationship(
  actor: ClinicalActor,
  patientId: string,
): Promise<boolean> {
  if (actor.isAdmin) return true;
  const [evo, rx, order, plan] = await Promise.all([
    prisma.evolution.count({
      where: { userId: actor.userId, clinicalRecord: { patientId } },
    }),
    prisma.prescription.count({ where: { userId: actor.userId, patientId } }),
    prisma.studyOrder.count({ where: { userId: actor.userId, patientId } }),
    prisma.mealPlan.count({ where: { userId: actor.userId, patientId } }),
  ]);
  return evo + rx + order + plan > 0;
}

/**
 * Filtro Prisma de "pacientes de los que `userId` es tratante" (misma regla que
 * `medicHasRelationship`, en una sola query relacional). Para listados de
 * concesiones a decidir.
 */
export function treatedPatientWhere(userId: string): Prisma.PatientWhereInput {
  return {
    OR: [
      { clinicalRecord: { is: { evolutions: { some: { userId } } } } },
      { prescriptions: { some: { userId } } },
      { studyOrders: { some: { userId } } },
      { mealPlans: { some: { userId } } },
    ],
  };
}

/**
 * ¿Puede el actor EDITAR/ANULAR este asiento (o leerlo sin concesión)? Autor o
 * admin. Síncrono y sin concesiones: las rutas de escritura lo usan tal cual.
 * Para lecturas usar `canReadEntry`.
 */
export function canAccessEntry(actor: ClinicalActor, entry: { userId: string }): boolean {
  return actor.isAdmin || entry.userId === actor.userId;
}

/**
 * Filtro Prisma "solo asientos propios" (sin concesiones). Para lecturas usar
 * `readScopeForList`, que además contempla la concesión vigente.
 */
export function entryScope(actor: ClinicalActor): { userId?: string } {
  return actor.isMedic ? { userId: actor.userId } : {};
}

/** Respuesta estándar 403 para rutas clínicas. */
export const CLINICAL_FORBIDDEN = {
  success: false,
  error: "Sin acceso a datos clínicos",
} as const;

// ─── Concesiones de acceso (ClinicalAccessGrant) ─────────────────────────────

/** Concesión vigente, con `sections` / `entryIds` ya parseados y validados. */
export interface ActiveGrant {
  id: string;
  patientId: string;
  scope: GrantScopeValue;
  /** Solo relevante con PARTIAL (con FULL queda vacío). */
  sections: GrantSection[];
  /** Solo relevante con PARTIAL (con FULL queda vacío). */
  entryIds: string[];
  startsAt: Date;
  expiresAt: Date;
}

/** Parsea una columna JSON string[]; cualquier otra cosa → []. */
export function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Condición Prisma de "vigente": ACTIVE y startsAt ≤ now < expiresAt. */
export function activeGrantWhere(now: Date = new Date()) {
  return {
    status: "ACTIVE" as const,
    startsAt: { lte: now },
    expiresAt: { gt: now },
  };
}

/** Misma regla que `activeGrantWhere`, evaluada en memoria. */
export function isGrantActive(
  g: { status: string; startsAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    g.status === "ACTIVE" &&
    !!g.startsAt &&
    !!g.expiresAt &&
    g.startsAt.getTime() <= now.getTime() &&
    now.getTime() < g.expiresAt.getTime()
  );
}

/**
 * Estado efectivo: una ACTIVE vencida es EXPIRED aunque el cron
 * (prisma/purge-expired.ts) todavía no la haya marcado.
 */
export function effectiveGrantStatus(
  g: { status: GrantStatusValue; expiresAt: Date | null },
  now: Date = new Date(),
): GrantStatusValue {
  if (g.status === "ACTIVE" && (!g.expiresAt || g.expiresAt.getTime() <= now.getTime())) {
    return "EXPIRED";
  }
  return g.status;
}

/**
 * Concesión vigente de `userId` sobre `patientId`, o null. Por construcción hay
 * a lo sumo una (POST/approve lo impiden); si por una carrera hubiera varias,
 * se prioriza FULL y luego la de vencimiento más lejano.
 */
export async function findActiveGrant(
  userId: string,
  patientId: string | null | undefined,
): Promise<ActiveGrant | null> {
  if (!userId || !patientId) return null;
  const now = new Date();
  const g = await prisma.clinicalAccessGrant.findFirst({
    where: { grantedToUserId: userId, patientId, ...activeGrantWhere(now) },
    orderBy: [{ scope: "asc" }, { expiresAt: "desc" }],
    select: {
      id: true,
      patientId: true,
      status: true,
      scope: true,
      sections: true,
      entryIds: true,
      startsAt: true,
      expiresAt: true,
    },
  });
  // Doble chequeo en memoria (defensa en profundidad ante un where mal armado).
  if (!g || g.patientId !== patientId || !isGrantActive(g, now)) return null;
  const partial = g.scope === "PARTIAL";
  return {
    id: g.id,
    patientId: g.patientId,
    scope: g.scope,
    sections: partial ? parseJsonStringArray(g.sections).filter(isGrantSection) : [],
    entryIds: partial ? parseJsonStringArray(g.entryIds) : [],
    startsAt: g.startsAt!,
    expiresAt: g.expiresAt!,
  };
}

/** ¿La concesión cubre TODOS los asientos de este tipo? (FULL o sección). */
export function grantCoversKind(grant: ActiveGrant, kind: EntryKind): boolean {
  return grant.scope === "FULL" || grant.sections.includes(ENTRY_KIND_SECTION[kind]);
}

/** ¿La concesión cubre este asiento? (tipo completo o id listado). */
export function grantCoversEntry(grant: ActiveGrant, kind: EntryKind, entryId: string): boolean {
  return grantCoversKind(grant, kind) || grant.entryIds.includes(entryId);
}

export interface EntryReadResult {
  ok: boolean;
  /** Presente solo si la lectura es posible GRACIAS a una concesión (auditar). */
  grantId?: string;
}

/**
 * ¿Puede el actor LEER este asiento? Admin || autor || concesión vigente sobre
 * `patientId` que cubra el tipo (`kind`) o el `entry.id`.
 *
 * `patientId` debe ser el paciente DUEÑO del asiento (tomado del asiento o
 * de una query ya filtrada por paciente), nunca uno arbitrario del cliente: así
 * una concesión sobre el paciente A no abre asientos del paciente B aunque su
 * id figure en `entryIds`.
 */
export async function canReadEntry(
  actor: ClinicalActor,
  entry: { id: string; userId: string },
  patientId: string | null | undefined,
  kind: EntryKind,
): Promise<EntryReadResult> {
  if (canAccessEntry(actor, entry)) return { ok: true };
  if (!actor.isMedic || !patientId) return { ok: false };
  const grant = await findActiveGrant(actor.userId, patientId);
  if (grant && grantCoversEntry(grant, kind, entry.id)) {
    return { ok: true, grantId: grant.id };
  }
  return { ok: false };
}

/** Filtro por autor / id que se esparce en el `where` de un listado. */
export type EntryReadWhere = {
  userId?: string;
  OR?: Array<{ userId: string } | { id: { in: string[] } }>;
};

export interface ListReadScope {
  /**
   * Esparcir en el where del listado, JUNTO al filtro por paciente
   * (`patientId` / `clinicalRecordId`), que es obligatorio: un `{}` acá
   * significa "todos los asientos DE ESE PACIENTE".
   */
  where: EntryReadWhere;
  /** Presente si el listado puede incluir asientos ajenos por una concesión (auditar). */
  grantId?: string;
}

/**
 * Versión pura de `readScopeForList` (cuando la concesión ya se buscó):
 *
 * | actor                                          | where                                  |
 * |------------------------------------------------|----------------------------------------|
 * | admin                                          | {}                                     |
 * | médico sin concesión (o que no cubre el tipo)  | { userId }                             |
 * | concesión FULL o PARTIAL con la sección        | {}                    (+ grantId)      |
 * | PARTIAL sin la sección pero con entryIds       | { OR: [{ userId }, { id: { in } }] } (+ grantId) |
 */
export function listScopeFromGrant(
  actor: ClinicalActor,
  grant: ActiveGrant | null,
  kind: EntryKind,
): ListReadScope {
  if (actor.isAdmin) return { where: {} };
  const own = { userId: actor.userId };
  if (!actor.isMedic || !grant) return { where: own };
  if (grantCoversKind(grant, kind)) return { where: {}, grantId: grant.id };
  if (grant.entryIds.length > 0) {
    return { where: { OR: [own, { id: { in: grant.entryIds } }] }, grantId: grant.id };
  }
  return { where: own };
}

/**
 * Filtro de LECTURA para listados de asientos de un paciente (ver tabla en
 * `listScopeFromGrant`). Uso:
 *
 *   const scope = await readScopeForList(actor, patientId, "prescription");
 *   prisma.prescription.findMany({ where: { patientId, ...scope.where } });
 *   logAudit({ ..., details: { ..., ...grantAuditDetails(scope.grantId) } });
 *
 * Si la ruta además filtra con `OR` (p. ej. búsqueda), debe combinarlo con
 * `AND` para no pisar el `OR` del alcance.
 */
export async function readScopeForList(
  actor: ClinicalActor,
  patientId: string,
  kind: EntryKind,
): Promise<ListReadScope> {
  if (actor.isAdmin) return { where: {} };
  return listScopeFromGrant(actor, await findActiveGrant(actor.userId, patientId), kind);
}

/** `{ grantId }` para esparcir en `details` del audit (o `{}` si no hubo concesión). */
export function grantAuditDetails(grantId: string | undefined): { grantId?: string } {
  return grantId ? { grantId } : {};
}

/** Campos de la ficha que se devuelven SIEMPRE (vista base / redactada). */
export const RECORD_BASE_FIELDS = [
  "id",
  "patientId",
  "structuredAllergies", // dato de seguridad del paciente: visible sin relación
  "createdAt",
  "updatedAt",
] as const;

export interface RecordAccess {
  /** Ficha completa: admin, tratante o concesión FULL. */
  full: boolean;
  /**
   * Secciones de la ficha visibles. Todas si `full`; las de la concesión si
   * PARTIAL; [] si nada (igual se ve la vista base: alergias estructuradas).
   */
  sections: RecordSection[];
  /** Tratante o admin: puede EDITAR la ficha y decidir concesiones. */
  hasRelationship: boolean;
  /** Concesión vigente del actor sobre el paciente (si hay), para listados. */
  grant: ActiveGrant | null;
  /** Presente si la ficha se ve (total o parcialmente) gracias a la concesión. */
  grantId?: string;
}

/**
 * Qué secciones de la ficha puede VER el actor:
 * - admin / tratante / concesión FULL → todas (`full`).
 * - concesión PARTIAL → las secciones de ficha que liste (antecedentes,
 *   alergias, medicacion).
 * - nada → [] (vista base: solo alergias estructuradas, comportamiento previo).
 */
export async function recordSections(
  actor: ClinicalActor,
  patientId: string,
): Promise<RecordAccess> {
  const all = [...RECORD_SECTIONS];
  if (actor.isAdmin) {
    return { full: true, sections: all, hasRelationship: true, grant: null };
  }
  const [hasRelationship, grant] = await Promise.all([
    medicHasRelationship(actor, patientId),
    findActiveGrant(actor.userId, patientId),
  ]);
  if (hasRelationship) return { full: true, sections: all, hasRelationship, grant };
  if (grant?.scope === "FULL") {
    return { full: true, sections: all, hasRelationship: false, grant, grantId: grant.id };
  }
  const sections = grant ? grant.sections.filter(isRecordSection) : [];
  return {
    full: false,
    sections,
    hasRelationship: false,
    grant,
    ...(grant && sections.length > 0 ? { grantId: grant.id } : {}),
  };
}

/**
 * Campos de ClinicalRecord visibles para un acceso parcial (lista blanca):
 * base + campos de cada sección. `null` = ficha completa (sin redactar).
 */
export function recordVisibleFields(
  access: Pick<RecordAccess, "full" | "sections">,
): string[] | null {
  if (access.full) return null;
  const fields = new Set<string>(RECORD_BASE_FIELDS);
  for (const s of access.sections) {
    for (const f of RECORD_SECTION_FIELDS[s]) fields.add(f);
  }
  return [...fields];
}

/** Acciones posibles del actor sobre una concesión (fuente única para GET y PATCH). */
export interface GrantPermissions {
  approve: boolean;
  reject: boolean;
  revoke: boolean;
  cancel: boolean;
}

/**
 * - approve / reject: PENDING; admin o tratante que no sea el beneficiario.
 * - revoke: vigente; admin, tratante o quien la aprobó (no el beneficiario,
 *   que usa cancel).
 * - cancel: solo el beneficiario, sobre su PENDING o su vigente.
 *
 * `status` debe ser el estado EFECTIVO (`effectiveGrantStatus`).
 * `isTreating` = `medicHasRelationship(actor, grant.patientId)`.
 */
export function grantPermissions(
  actor: ClinicalActor,
  grant: { status: GrantStatusValue; grantedToUserId: string; decidedById: string | null },
  isTreating: boolean,
): GrantPermissions {
  const own = grant.grantedToUserId === actor.userId;
  const pending = grant.status === "PENDING";
  const active = grant.status === "ACTIVE";
  const decider = actor.isAdmin || (actor.isMedic && isTreating && !own);
  return {
    approve: pending && decider,
    reject: pending && decider,
    revoke:
      active &&
      !own &&
      (actor.isAdmin || (actor.isMedic && (isTreating || grant.decidedById === actor.userId))),
    cancel: own && (pending || active),
  };
}
