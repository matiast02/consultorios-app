"use client";

import { Megaphone, Stethoscope, XCircle } from "lucide-react";
import type { CalledItem } from "@/types";
import { formatTicketNumber } from "@/lib/waiting-room/format";
import { formatTime } from "@/lib/format";

interface CalledListProps {
  items: CalledItem[];
  /** Módulo waiting_room activo: habilita «Volver a llamar» (solo con número). */
  waitingRoomEnabled: boolean;
  onRecall: (item: CalledItem) => void;
  onMarkAbsent: (shiftId: string) => void;
}


/** Pacientes ya llamados a consulta (pestaña «En consulta» de la sala de espera). */
export function CalledList({ items, waitingRoomEnabled, onRecall, onMarkAbsent }: CalledListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Stethoscope className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">Nadie en consulta</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Los pacientes llamados a consultorio aparecen acá hasta que el médico finaliza la atención.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {items.map((it) => (
        <li key={it.shiftId} className="px-5 py-3.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {it.ticketNumber != null && (
                  <span
                    title="Número de sala"
                    className="rounded-md bg-[#0d4f4d]/10 px-1.5 py-0.5 font-mono text-[11.5px] font-bold tabular-nums text-[#0d4f4d]"
                  >
                    N.º {formatTicketNumber(it.ticketNumber)}
                  </span>
                )}
                <span className="font-semibold text-foreground">
                  {it.patient.lastName}
                  <span className="text-muted-foreground">, {it.patient.firstName}</span>
                </span>
                {it.callCount > 1 && (
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {it.callCount} llamados
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                  {it.medicColor && (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: it.medicColor }} />
                  )}
                  {it.medicShortName}
                </span>
                {it.room && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{it.room}</span>
                  </>
                )}
                <span className="text-muted-foreground/40">·</span>
                <span>
                  llamado <span className="tabular-nums">{formatTime(it.calledAt)}</span>
                  {it.minutesSinceCall > 0 && ` (hace ${it.minutesSinceCall} min)`}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {waitingRoomEnabled && it.ticketNumber != null && (
                  <button
                    type="button"
                    onClick={() => onRecall(it)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0d4f4d] px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-[#0a3f3d]"
                  >
                    <Megaphone className="h-3 w-3" />
                    Volver a llamar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onMarkAbsent(it.shiftId)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[12px] font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <XCircle className="h-3 w-3" />
                  No se presentó
                </button>
              </div>
            </div>

            <div className="shrink-0 text-right text-muted-foreground">
              <div className="text-xl font-bold tabular-nums leading-none">{it.minutesSinceCall}</div>
              <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em]">min desde el llamado</div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
