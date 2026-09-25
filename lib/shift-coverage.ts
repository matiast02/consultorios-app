// Cobertura con la que se atiende un turno.
//
// Antes el sistema solo avisaba «el profesional no acepta la obra social, se
// atenderá como particular» y no quedaba registrado. Ahora cada turno nuevo
// guarda `coverageInsuranceId` (obra social aceptada por el profesional) o
// `isPrivate` (particular). Los turnos anteriores a esta versión tienen ambos
// vacíos: la UI muestra entonces la obra social del paciente, como antes.
//
// Regla:
//   - el paciente no tiene obra social (o solo «Particular») → particular;
//   - el profesional no configuró obras sociales aceptadas → se toma la
//     principal del paciente (`Patient.osId`, o la primera cargada);
//   - si configuró: la principal si la acepta, si no la primera aceptada;
//     ninguna aceptada → particular con aviso (`mismatch`).

import { prisma } from "@/lib/prisma";

type Db = Pick<typeof prisma, "patient" | "patientInsurance" | "userInsurance">;

export interface ShiftCoverage {
  /** Obra social con la que se atiende; null si es particular. */
  coverageInsuranceId: string | null;
  /** Se atiende como particular. */
  isPrivate: boolean;
  /** El paciente tiene obra social pero el profesional no la acepta (aviso a recepción). */
  mismatch: boolean;
}

export const INSURANCE_MISMATCH_WARNING = {
  code: "INSURANCE_MISMATCH",
  message: "El paciente no tiene una obra social aceptada por este profesional. Se atendera como particular.",
} as const;

const PRIVATE_NAME = "particular";

function isPrivateName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === PRIVATE_NAME;
}

export async function resolveShiftCoverage(
  db: Db,
  args: { userId: string; patientId: string },
): Promise<ShiftCoverage> {
  const [patient, extra, accepted] = await Promise.all([
    db.patient.findUnique({
      where: { id: args.patientId },
      select: { osId: true, os: { select: { id: true, name: true } } },
    }),
    db.patientInsurance.findMany({
      where: { patientId: args.patientId },
      select: { healthInsuranceId: true, healthInsurance: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.userInsurance.findMany({ where: { userId: args.userId }, select: { healthInsuranceId: true } }),
  ]);

  // Obras sociales del paciente, principal primero, sin «Particular» ni repetidas.
  const candidates: string[] = [];
  if (patient?.os && !isPrivateName(patient.os.name)) candidates.push(patient.os.id);
  for (const pi of extra ?? []) {
    if (isPrivateName(pi.healthInsurance?.name)) continue;
    if (!candidates.includes(pi.healthInsuranceId)) candidates.push(pi.healthInsuranceId);
  }

  if (candidates.length === 0) {
    return { coverageInsuranceId: null, isPrivate: true, mismatch: false };
  }

  const acceptedIds = new Set((accepted ?? []).map((u) => u.healthInsuranceId));
  if (acceptedIds.size === 0) {
    // Sin lista configurada no se puede saber: se asume la principal.
    return { coverageInsuranceId: candidates[0], isPrivate: false, mismatch: false };
  }

  const match = candidates.find((id) => acceptedIds.has(id));
  if (match) return { coverageInsuranceId: match, isPrivate: false, mismatch: false };
  return { coverageInsuranceId: null, isPrivate: true, mismatch: true };
}

/** Campos de `Shift` a persistir. */
export function coverageData(c: ShiftCoverage): { coverageInsuranceId: string | null; isPrivate: boolean } {
  return { coverageInsuranceId: c.coverageInsuranceId, isPrivate: c.isPrivate };
}
