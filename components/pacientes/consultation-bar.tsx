"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  FilePlus2,
  Loader2,
  Megaphone,
  Pill,
  Play,
  RotateCcw,
} from "lucide-react";

import type { Shift } from "@/types";
import { minutesSince, type ConsultationPhase } from "@/lib/consultation-flow";
import { formatTicketNumber } from "@/lib/waiting-room/format";
import { fmtTime } from "@/components/pacientes/shared";
import { cn } from "@/lib/utils";

/**
 * Barra «Consulta en curso» de la ficha del paciente (solo médico).
 *
 * La ficha es el lugar donde se atiende; esta barra mantiene a la vista el turno
 * de hoy y sus acciones sin volver al dashboard: llamar / iniciar, nueva
 * evolución vinculada, receta, orden, volver a llamar y finalizar. Cambia de
 * tono según la fase (agendado, en sala, en consulta, finalizado).
 */
export interface ConsultationBarProps {
  /** Turno de hoy del médico, con `ticket` si tiene número de sala abierto. */
  shift: Shift;
  phase: ConsultationPhase;
  /** Módulo waiting_room activo: «Llamar a consultorio» en vez de «Iniciar consulta» y «Volver a llamar». */
  waitingRoomEnabled: boolean;
  /** Ya hay una evolución vinculada a este turno. */
  evolutionRecorded: boolean;
  prescriptionsEnabled: boolean;
  studyOrdersEnabled: boolean;
  busy?: boolean;
  onStart: () => void;
  onRecall: () => void;
  onFinish: () => void;
  onNewEvolution: () => void;
  onPrescription: () => void;
  onStudyOrder: () => void;
  onBack: () => void;
}

const PHASE_LABEL: Record<ConsultationPhase, string> = {
  scheduled: "Turno de hoy",
  waiting: "En sala de espera",
  inConsultation: "En consulta",
  finished: "Atención finalizada",
};

/** Cobertura del turno; en turnos viejos, la obra social del paciente. */
function coverageLabel(s: Shift): string | null {
  if (s.coverageInsurance) return s.coverageInsurance.name;
  if (s.isPrivate) return "Particular";
  return s.patient?.os?.name ?? null;
}

export function ConsultationBar({
  shift,
  phase,
  waitingRoomEnabled,
  evolutionRecorded,
  prescriptionsEnabled,
  studyOrdersEnabled,
  busy = false,
  onStart,
  onRecall,
  onFinish,
  onNewEvolution,
  onPrescription,
  onStudyOrder,
  onBack,
}: ConsultationBarProps) {
  // Re-render cada 30 s para que «12 min en consulta» avance solo.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const dark = phase === "inConsultation";
  const ticket = shift.ticket ?? null;
  const coverage = coverageLabel(shift);
  const consultationType = shift.consultationType?.name ?? "Consulta";

  const elapsed =
    phase === "inConsultation" && shift.consultationStartedAt
      ? `${minutesSince(shift.consultationStartedAt)} min en consulta`
      : phase === "waiting" && shift.arrivedAt
        ? `${minutesSince(shift.arrivedAt)} min en sala`
        : null;

  const tone = {
    scheduled: "border bg-card text-foreground",
    waiting:
      "border border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100",
    inConsultation: "text-white ring-1 ring-black/5 shadow-md",
    finished:
      "border border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100",
  }[phase];

  const badge = {
    scheduled: "bg-muted text-muted-foreground",
    waiting: "bg-emerald-600 text-white",
    inConsultation: "bg-white/15 text-emerald-50",
    finished: "bg-sky-600 text-white",
  }[phase];

  const primaryBtn = cn(
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold shadow-sm transition disabled:opacity-50",
    dark ? "bg-white text-[#0d4f4d] hover:bg-emerald-50" : "bg-[#0d4f4d] text-white hover:bg-[#0a3f3d]",
  );
  const secondaryBtn = cn(
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50",
    dark
      ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
      : "border-border bg-card text-foreground hover:bg-muted",
  );

  const startLabel = waitingRoomEnabled && phase === "waiting" ? "Llamar a consultorio" : "Iniciar consulta";
  const StartIcon = waitingRoomEnabled && phase === "waiting" ? Megaphone : Play;

  return (
    <div
      role="region"
      aria-label="Consulta en curso"
      className={cn("sticky top-[60px] z-30 rounded-2xl px-4 py-3", tone)}
      style={
        dark
          ? { background: "linear-gradient(135deg, #0e5b58 0%, #0d4f4d 55%, #0a3f3d 100%)" }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onBack}
          title="Volver al panel"
          aria-label="Volver al panel"
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition",
            dark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]",
              badge,
            )}
          >
            {phase === "inConsultation" && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
            )}
            {PHASE_LABEL[phase]}
          </span>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {fmtTime(new Date(shift.start))} · {consultationType}
              {coverage && <> · {coverage}</>}
            </div>
            <div className={cn("truncate text-xs", dark ? "text-emerald-100/80" : "text-muted-foreground")}>
              {ticket && (
                <>
                  N.º {formatTicketNumber(ticket.number)}
                  {ticket.room && <> · {ticket.room}</>}
                </>
              )}
              {ticket && elapsed && <> · </>}
              {elapsed}
              {!ticket && !elapsed && phase === "scheduled" && "El paciente todavía no llegó"}
              {!ticket && !elapsed && phase === "finished" && "Podés cargar una receta u orden antes de volver"}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2" aria-busy={busy}>
          {(phase === "scheduled" || phase === "waiting") && (
            <button type="button" onClick={onStart} disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StartIcon className="h-3.5 w-3.5" />}
              {startLabel}
            </button>
          )}

          {phase === "inConsultation" && (
            <>
              {evolutionRecorded ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium",
                    dark ? "bg-white/10 text-emerald-50" : "bg-emerald-100 text-emerald-800",
                  )}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Evolución registrada
                </span>
              ) : (
                <button type="button" onClick={onNewEvolution} className={secondaryBtn}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Nueva evolución
                </button>
              )}
              {prescriptionsEnabled && (
                <button type="button" onClick={onPrescription} className={secondaryBtn}>
                  <Pill className="h-3.5 w-3.5" />
                  Receta
                </button>
              )}
              {studyOrdersEnabled && (
                <button type="button" onClick={onStudyOrder} className={secondaryBtn}>
                  <ClipboardList className="h-3.5 w-3.5" />
                  Orden
                </button>
              )}
              {waitingRoomEnabled && ticket && (
                <button
                  type="button"
                  onClick={onRecall}
                  disabled={busy}
                  title="Volver a llamar"
                  aria-label="Volver a llamar"
                  className={cn(secondaryBtn, "px-2")}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button type="button" onClick={onFinish} disabled={busy} className={primaryBtn}>
                <CheckCircle className="h-3.5 w-3.5" />
                Finalizar atención
              </button>
            </>
          )}

          {phase === "finished" && (
            <>
              {prescriptionsEnabled && (
                <button type="button" onClick={onPrescription} className={secondaryBtn}>
                  <Pill className="h-3.5 w-3.5" />
                  Receta
                </button>
              )}
              {studyOrdersEnabled && (
                <button type="button" onClick={onStudyOrder} className={secondaryBtn}>
                  <ClipboardList className="h-3.5 w-3.5" />
                  Orden
                </button>
              )}
              <button type="button" onClick={onBack} className={primaryBtn}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al panel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
