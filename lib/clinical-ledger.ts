// Clinical ledger — inalterabilidad (Ley 26.529 / Decreto 1089/2012).
// Cada create/corrección/anulación de un asiento clínico agrega una fila
// INMUTABLE a ClinicalEntryVersion. El hash encadena versiones por entidad
// (contentHash incluye el prevHash) para detectar manipulación posterior.

import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ClinicalEntityType =
  | "evolution"
  | "clinical_record"
  | "prescription"
  | "study_order"
  | "meal_plan";

export type LedgerAction = "created" | "corrected" | "annulled";

type Tx = Prisma.TransactionClient | PrismaClient;

// ─── Snapshot builders (definen qué campos clínicos se versionan) ─────────────



export function evolutionSnapshot(e: Record<string, unknown>): Record<string, unknown> {
  return {
    reason: e.reason ?? null,
    physicalExam: e.physicalExam ?? null,
    diagnosis: e.diagnosis ?? null,
    diagnosisCode: e.diagnosisCode ?? null,
    treatment: e.treatment ?? null,
    indications: e.indications ?? null,
    notes: e.notes ?? null,
    shiftId: e.shiftId ?? null,
  };
}

export function clinicalRecordSnapshot(r: Record<string, unknown>): Record<string, unknown> {
  return {
    bloodType: r.bloodType ?? null,
    allergies: r.allergies ?? null,
    personalHistory: r.personalHistory ?? null,
    familyHistory: r.familyHistory ?? null,
    currentMedication: r.currentMedication ?? null,
    notes: r.notes ?? null,
    heightCm: r.heightCm ?? null,
    weightKg: r.weightKg ?? null,
    habitsTobacco: r.habitsTobacco ?? null,
    habitsAlcohol: r.habitsAlcohol ?? null,
    habitsActivity: r.habitsActivity ?? null,
    habitsDiet: r.habitsDiet ?? null,
    structuredAllergies: r.structuredAllergies ?? null,
    odontogram: r.odontogram ?? null,
    genogram: r.genogram ?? null,
  };
}

export function prescriptionSnapshot(p: Record<string, unknown>): Record<string, unknown> {
  return {
    items: p.items ?? null,
    diagnosis: p.diagnosis ?? null,
    notes: p.notes ?? null,
    durationDays: p.durationDays ?? null,
    shiftId: p.shiftId ?? null,
  };
}

export function studyOrderSnapshot(s: Record<string, unknown>): Record<string, unknown> {
  return {
    items: s.items ?? null,
    status: s.status ?? null,
    resultNotes: s.resultNotes ?? null,
    shiftId: s.shiftId ?? null,
  };
}

export function mealPlanSnapshot(m: Record<string, unknown>): Record<string, unknown> {
  return {
    title: m.title ?? null,
    targetCalories: m.targetCalories ?? null,
    proteinPct: m.proteinPct ?? null,
    carbsPct: m.carbsPct ?? null,
    fatPct: m.fatPct ?? null,
    hydration: m.hydration ?? null,
    meals: m.meals ?? null,
    avoidFoods: m.avoidFoods ?? null,
    supplements: m.supplements ?? null,
    notes: m.notes ?? null,
    shiftId: m.shiftId ?? null,
  };
}

/**
 * Deterministic hash over the exact stored fields. We hash the literal `dataJson`
 * string so nested key ordering can never change the digest.
 */
function computeHash(input: {
  entityType: string;
  entityId: string;
  version: number;
  action: string;
  authorId: string;
  reason: string | null;
  prevHash: string | null;
  dataJson: string;
}): string {
  const payload = [
    input.entityType,
    input.entityId,
    String(input.version),
    input.action,
    input.authorId,
    input.reason ?? "",
    input.prevHash ?? "",
    input.dataJson,
  ].join("\n");
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Append an immutable version to the ledger. Must run inside the same
 * transaction as the entity write so state + ledger stay consistent.
 * The (entityType, entityId, version) unique constraint guards against races.
 */
export async function recordClinicalVersion(
  tx: Tx,
  params: {
    entityType: ClinicalEntityType;
    entityId: string;
    patientId?: string | null;
    action: LedgerAction;
    data: Record<string, unknown>;
    authorId: string;
    reason?: string | null;
  }
) {
  const last = await tx.clinicalEntryVersion.findFirst({
    where: { entityType: params.entityType, entityId: params.entityId },
    orderBy: { version: "desc" },
    select: { version: true, contentHash: true },
  });

  const version = (last?.version ?? 0) + 1;
  const prevHash = last?.contentHash ?? null;
  const dataJson = JSON.stringify(params.data ?? {});
  const reason = params.reason ?? null;

  const contentHash = computeHash({
    entityType: params.entityType,
    entityId: params.entityId,
    version,
    action: params.action,
    authorId: params.authorId,
    reason,
    prevHash,
    dataJson,
  });

  return tx.clinicalEntryVersion.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      patientId: params.patientId ?? null,
      version,
      action: params.action,
      data: dataJson,
      authorId: params.authorId,
      reason,
      contentHash,
      prevHash,
    },
  });
}

/**
 * Recompute the chain for one entity and report the first broken version (if any).
 * Detects both content tampering and reordering/removal.
 */
export async function verifyClinicalChain(
  entityType: ClinicalEntityType,
  entityId: string
): Promise<{ valid: boolean; brokenAtVersion?: number; versions: number }> {
  const rows = await prisma.clinicalEntryVersion.findMany({
    where: { entityType, entityId },
    orderBy: { version: "asc" },
  });

  let expectedPrev: string | null = null;
  let expectedVersion = 1;

  for (const row of rows) {
    if (row.version !== expectedVersion || row.prevHash !== expectedPrev) {
      return { valid: false, brokenAtVersion: row.version, versions: rows.length };
    }
    const recomputed = computeHash({
      entityType: row.entityType,
      entityId: row.entityId,
      version: row.version,
      action: row.action,
      authorId: row.authorId,
      reason: row.reason ?? null,
      prevHash: row.prevHash ?? null,
      dataJson: row.data,
    });
    if (recomputed !== row.contentHash) {
      return { valid: false, brokenAtVersion: row.version, versions: rows.length };
    }
    expectedPrev = row.contentHash;
    expectedVersion += 1;
  }

  return { valid: true, versions: rows.length };
}
