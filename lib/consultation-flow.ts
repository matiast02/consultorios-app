// Flujo de atención del médico: qué turno de hoy está «activo» en la ficha del
// paciente y en qué fase está. Lo usan la barra «Consulta en curso» de la ficha
// y el dashboard del médico. Lógica pura (sin base ni fetch), apta para el cliente.
//
// Fases de un turno de hoy:
//   scheduled       agendado, el paciente todavía no llegó
//   waiting         recepción registró la llegada (está en sala)
//   inConsultation  ya fue llamado / pasó a consulta (`consultationStartedAt`)
//   finished        FINISHED (solo interesa cuando la ficha se abrió para ese turno)

import type { ShiftStatus } from "@/types";
import { isSameLocalDay, minutesSince } from "@/lib/format";

export { isSameLocalDay, minutesSince };

export type ConsultationPhase = "scheduled" | "waiting" | "inConsultation" | "finished";

export interface PhaseInput {
  status: ShiftStatus;
  arrivedAt?: string | null;
  consultationStartedAt?: string | null;
}

const OPEN_STATUSES: ShiftStatus[] = ["PENDING", "CONFIRMED"];

/** Fase del turno; null si está cancelado o ausente (no hay nada que atender). */
export function consultationPhase(s: PhaseInput): ConsultationPhase | null {
  if (s.status === "FINISHED") return "finished";
  if (!OPEN_STATUSES.includes(s.status)) return null;
  if (s.consultationStartedAt) return "inConsultation";
  if (s.arrivedAt) return "waiting";
  return "scheduled";
}


const PHASE_RANK: Record<ConsultationPhase, number> = {
  inConsultation: 0,
  waiting: 1,
  scheduled: 2,
  finished: 3,
};

export interface ActiveShift<T> {
  shift: T;
  phase: ConsultationPhase;
}

/**
 * Turno de hoy sobre el que trabaja la ficha.
 *
 * Si vino uno por URL (`?turno=`) y es del médico y de hoy, es ese (aunque ya esté
 * finalizado: así la ficha muestra «Atención finalizada» después de cerrar la
 * consulta). Si no, el que está en consulta; luego el que espera en sala; luego el
 * próximo agendado. Los finalizados no se eligen solos.
 */
export function resolveActiveShift<T extends PhaseInput & { id: string; userId: string; start: string }>(
  shifts: T[],
  opts: { medicId: string; preferredId?: string | null; now?: Date },
): ActiveShift<T> | null {
  const now = opts.now ?? new Date();
  const today = shifts.filter((s) => s.userId === opts.medicId && isSameLocalDay(new Date(s.start), now));

  if (opts.preferredId) {
    const preferred = today.find((s) => s.id === opts.preferredId);
    const phase = preferred ? consultationPhase(preferred) : null;
    if (preferred && phase) return { shift: preferred, phase };
  }

  const candidates: ActiveShift<T>[] = [];
  for (const s of today) {
    const phase = consultationPhase(s);
    if (phase && phase !== "finished") candidates.push({ shift: s, phase });
  }
  candidates.sort(
    (a, b) =>
      PHASE_RANK[a.phase] - PHASE_RANK[b.phase] ||
      new Date(a.shift.start).getTime() - new Date(b.shift.start).getTime(),
  );
  return candidates[0] ?? null;
}

