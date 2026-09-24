// Reglas para eliminar (purge) o archivar (archive) pacientes.
//
// - purge (borrado físico): solo si no hay asientos clínicos de nadie y no hay
//   turnos no cancelados con otros profesionales (médico) / ningún turno no
//   cancelado (secretaria, admin). Admin, secretaria o el médico creador.
// - archive (baja lógica): médico creador sin asientos ni turnos de otros
//   profesionales; admin siempre (con warnings); secretaria nunca. Un turno
//   FUTURO no cancelado con otro profesional bloquea a todos.
//
// La evaluación es pura (`evaluatePatientDeletion`) para poder testearla sin DB;
// `gatherPatientDeletionFacts` junta los datos (acepta `prisma` o el `tx`).

import { prisma } from "@/lib/prisma";

export type PatientDeletionMode = "purge" | "archive";

export function isPatientDeletionMode(v: unknown): v is PatientDeletionMode {
  return v === "purge" || v === "archive";
}

type Tx = Omit<typeof prisma, "$extends" | "$transaction" | "$connect" | "$disconnect" | "$on">;

export interface PatientDeletionFacts {
  createdById: string | null;
  /** Asientos clínicos distintos (tablas origen ∪ ledger), de cualquier autor. */
  clinicalEntries: number;
  /** Autores distintos de esos asientos. */
  clinicalAuthorIds: string[];
  /** Turnos no cancelados (pasados y futuros). */
  activeShifts: { userId: string; start: Date }[];
}

export interface PatientDeletionEvaluation {
  outcome: "allow" | "forbidden" | "blocked";
  code?: "PURGE_BLOCKED" | "ARCHIVE_BLOCKED";
  error?: string;
  clinicalEntries: number;
  /** Profesionales ≠ solicitante con asientos o turnos no cancelados. */
  otherProfessionalIds: string[];
  /** Subconjunto que surge solo de turnos (visible para roles no clínicos). */
  otherShiftProfessionalIds: string[];
  futureShiftsWithOthers: number;
  ownFutureShifts: number;
  canArchive: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Error de permiso por rol/autoría (independiente del estado clínico), o null. */
export function patientDeletionForbiddenReason(
  mode: PatientDeletionMode,
  role: string | null,
  actorId: string,
  createdById: string | null,
): string | null {
  const isCreator = createdById !== null && createdById === actorId;
  if (mode === "archive") {
    if (role === "admin") return null;
    if (role === "medic" && isCreator) return null;
    if (role === "secretary") {
      return "La secretaría no puede archivar pacientes. Pedile al administrador.";
    }
    return "Solo el profesional que dio de alta al paciente o el administrador pueden archivarlo.";
  }
  if (role === "admin" || role === "secretary") return null;
  if (role === "medic" && isCreator) return null;
  return "Solo el profesional que dio de alta al paciente, la secretaría o el administrador pueden eliminarlo.";
}

export function evaluatePatientDeletion(input: {
  mode: PatientDeletionMode;
  role: string | null;
  actorId: string;
  facts: PatientDeletionFacts;
  now?: Date;
}): PatientDeletionEvaluation {
  const { mode, role, actorId, facts } = input;
  const now = (input.now ?? new Date()).getTime();
  const isMedic = role === "medic";

  const shiftsWithOthers = facts.activeShifts.filter((s) => s.userId !== actorId);
  const futureShiftsWithOthers = shiftsWithOthers.filter((s) => s.start.getTime() > now).length;
  const ownFutureShifts = facts.activeShifts.filter(
    (s) => s.userId === actorId && s.start.getTime() > now,
  ).length;
  const otherShiftProfessionalIds = [...new Set(shiftsWithOthers.map((s) => s.userId))];
  const otherProfessionalIds = [
    ...new Set([
      ...facts.clinicalAuthorIds.filter((id) => id !== actorId),
      ...otherShiftProfessionalIds,
    ]),
  ];

  // ¿Podría este actor archivar al paciente en su estado actual?
  let archiveBlockReason: string | null = null;
  if (futureShiftsWithOthers > 0) {
    archiveBlockReason = `tiene ${plural(futureShiftsWithOthers, "turno futuro", "turnos futuros")} con otros profesionales; hay que cancelarlos antes de archivarlo`;
  } else if (isMedic && otherProfessionalIds.length > 0) {
    archiveBlockReason =
      "tiene historia clínica o turnos con otros profesionales; solo el administrador puede archivarlo";
  }
  const canArchive =
    patientDeletionForbiddenReason("archive", role, actorId, facts.createdById) === null &&
    archiveBlockReason === null;

  const base = {
    clinicalEntries: facts.clinicalEntries,
    otherProfessionalIds,
    otherShiftProfessionalIds,
    futureShiftsWithOthers,
    ownFutureShifts,
    canArchive,
  };

  const forbidden = patientDeletionForbiddenReason(mode, role, actorId, facts.createdById);
  if (forbidden) return { ...base, outcome: "forbidden", error: forbidden };

  if (mode === "archive") {
    if (archiveBlockReason) {
      return {
        ...base,
        outcome: "blocked",
        code: "ARCHIVE_BLOCKED",
        error: `No se puede archivar: el paciente ${archiveBlockReason}.`,
      };
    }
    return { ...base, outcome: "allow" };
  }

  // purge
  const reasons: string[] = [];
  if (facts.clinicalEntries > 0) {
    reasons.push(
      `tiene historia clínica (${plural(facts.clinicalEntries, "registro", "registros")})`,
    );
  }
  if (isMedic) {
    if (shiftsWithOthers.length > 0) {
      reasons.push(
        `tiene ${plural(shiftsWithOthers.length, "turno", "turnos")} con otros profesionales`,
      );
    }
  } else if (facts.activeShifts.length > 0) {
    reasons.push(
      `tiene ${plural(facts.activeShifts.length, "turno no cancelado", "turnos no cancelados")}`,
    );
  }
  if (reasons.length > 0) {
    return {
      ...base,
      outcome: "blocked",
      code: "PURGE_BLOCKED",
      error: `No se puede eliminar definitivamente: el paciente ${reasons.join(" y ")}.`,
    };
  }
  return { ...base, outcome: "allow" };
}

/**
 * Junta los datos para evaluar. Consultas secuenciales a propósito: puede
 * correr dentro de un `$transaction` interactivo (una sola conexión).
 */
export async function gatherPatientDeletionFacts(
  db: Tx,
  patient: { id: string; createdById: string | null },
): Promise<PatientDeletionFacts> {
  const patientId = patient.id;
  const byId = { select: { id: true, userId: true } } as const;

  const evolutions = await db.evolution.findMany({
    where: { clinicalRecord: { patientId } },
    ...byId,
  });
  const prescriptions = await db.prescription.findMany({ where: { patientId }, ...byId });
  const studyOrders = await db.studyOrder.findMany({ where: { patientId }, ...byId });
  const mealPlans = await db.mealPlan.findMany({ where: { patientId }, ...byId });
  const ledger = await db.clinicalEntryVersion.findMany({
    where: { patientId },
    select: { entityType: true, entityId: true, authorId: true },
  });
  const activeShifts = await db.shift.findMany({
    where: { patientId, status: { not: "CANCELLED" } },
    select: { userId: true, start: true },
  });

  const entries = new Set<string>();
  const authors = new Set<string>();
  const add = (type: string, rows: { id: string; userId: string }[]) => {
    for (const r of rows ?? []) {
      entries.add(`${type}:${r.id}`);
      authors.add(r.userId);
    }
  };
  add("evolution", evolutions);
  add("prescription", prescriptions);
  add("study_order", studyOrders);
  add("meal_plan", mealPlans);
  for (const v of ledger ?? []) {
    entries.add(`${v.entityType}:${v.entityId}`);
    authors.add(v.authorId);
  }

  return {
    createdById: patient.createdById,
    clinicalEntries: entries.size,
    clinicalAuthorIds: [...authors],
    activeShifts: (activeShifts ?? []).map((s) => ({ userId: s.userId, start: new Date(s.start) })),
  };
}

/** Nombres para mostrar de los profesionales involucrados. */
export async function resolveProfessionalNames(
  ids: string[],
): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, firstName: true, lastName: true },
  });
  const byId = new Map(
    (users ?? []).map((u) => [
      u.id,
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || "Profesional",
    ]),
  );
  return ids.map((id) => ({ id, name: byId.get(id) ?? "Profesional" }));
}
