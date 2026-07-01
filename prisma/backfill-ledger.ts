// One-time backfill: crea la versión inicial (v1) en el ledger inmutable para
// todos los asientos clínicos preexistentes. Idempotente: omite las entidades
// que ya tengan alguna versión registrada.
//
// Uso: pnpm run db:backfill-ledger   (correr una vez por entorno tras migrar)

import { prisma } from "../lib/prisma";
import {
  recordClinicalVersion,
  evolutionSnapshot,
  clinicalRecordSnapshot,
  prescriptionSnapshot,
  studyOrderSnapshot,
  mealPlanSnapshot,
  type ClinicalEntityType,
} from "../lib/clinical-ledger";

async function alreadyVersioned(entityType: ClinicalEntityType, entityId: string) {
  const existing = await prisma.clinicalEntryVersion.findFirst({
    where: { entityType, entityId },
    select: { id: true },
  });
  return existing != null;
}

async function main() {
  let created = 0;
  let skipped = 0;

  // Evolutions
  const evolutions = await prisma.evolution.findMany({
    include: { clinicalRecord: { select: { patientId: true } } },
  });
  for (const e of evolutions) {
    if (await alreadyVersioned("evolution", e.id)) { skipped++; continue; }
    await recordClinicalVersion(prisma, {
      entityType: "evolution",
      entityId: e.id,
      patientId: e.clinicalRecord?.patientId ?? null,
      action: "created",
      data: evolutionSnapshot(e),
      authorId: e.userId,
      reason: "Backfill v1 (registro preexistente)",
    });
    created++;
  }

  // Clinical records (sin autor propio → se marca como backfill del sistema)
  const records = await prisma.clinicalRecord.findMany();
  for (const r of records) {
    if (await alreadyVersioned("clinical_record", r.id)) { skipped++; continue; }
    await recordClinicalVersion(prisma, {
      entityType: "clinical_record",
      entityId: r.id,
      patientId: r.patientId,
      action: "created",
      data: clinicalRecordSnapshot(r),
      authorId: "system-backfill",
      reason: "Backfill v1 (registro preexistente)",
    });
    created++;
  }

  // Prescriptions
  const prescriptions = await prisma.prescription.findMany();
  for (const p of prescriptions) {
    if (await alreadyVersioned("prescription", p.id)) { skipped++; continue; }
    await recordClinicalVersion(prisma, {
      entityType: "prescription",
      entityId: p.id,
      patientId: p.patientId,
      action: "created",
      data: prescriptionSnapshot(p),
      authorId: p.userId,
      reason: "Backfill v1 (registro preexistente)",
    });
    created++;
  }

  // Study orders
  const studyOrders = await prisma.studyOrder.findMany();
  for (const s of studyOrders) {
    if (await alreadyVersioned("study_order", s.id)) { skipped++; continue; }
    await recordClinicalVersion(prisma, {
      entityType: "study_order",
      entityId: s.id,
      patientId: s.patientId,
      action: "created",
      data: studyOrderSnapshot(s),
      authorId: s.userId,
      reason: "Backfill v1 (registro preexistente)",
    });
    created++;
  }

  // Meal plans
  const mealPlans = await prisma.mealPlan.findMany();
  for (const m of mealPlans) {
    if (await alreadyVersioned("meal_plan", m.id)) { skipped++; continue; }
    await recordClinicalVersion(prisma, {
      entityType: "meal_plan",
      entityId: m.id,
      patientId: m.patientId,
      action: "created",
      data: mealPlanSnapshot(m),
      authorId: m.userId,
      reason: "Backfill v1 (registro preexistente)",
    });
    created++;
  }

  console.log(`Backfill completo: ${created} versiones creadas, ${skipped} omitidas (ya versionadas).`);
}

main()
  .catch((e) => {
    console.error("Backfill error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
