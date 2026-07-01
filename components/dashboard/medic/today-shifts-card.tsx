"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, User as UserIcon, Pencil } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OsBadge } from "./os-badge";
import type { DashboardShift, ShiftStatus } from "@/types";

interface TodayShiftsCardProps {
  shifts: DashboardShift[];
  nextShiftId: string | null;
  onAttend: (shift: DashboardShift) => void;
  onViewPatient: (patientId: string) => void;
  onEditObs: (shift: DashboardShift) => void;
  /** Click on a shift row (anywhere outside the quick-action buttons). */
  onSelectShift?: (shift: DashboardShift) => void;
}

type TabKey = "todos" | "porAtender" | "atendidos" | "ausentes";

const STATUS_LABEL: Record<ShiftStatus, string> = {
  PENDING:   "Pendiente",
  CONFIRMED: "Confirmado",
  ABSENT:    "Ausente",
  FINISHED:  "Finalizado",
  CANCELLED: "Cancelado",
};

const STATUS_DOT: Record<ShiftStatus, string> = {
  PENDING:   "bg-amber-500",
  CONFIRMED: "bg-sky-500",
  ABSENT:    "bg-rose-500",
  FINISHED:  "bg-emerald-500",
  CANCELLED: "bg-slate-400",
};

const STATUS_TEXT: Record<ShiftStatus, string> = {
  PENDING:   "text-amber-700",
  CONFIRMED: "text-sky-700",
  ABSENT:    "text-rose-700",
  FINISHED:  "text-emerald-700",
  CANCELLED: "text-slate-500",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: ShiftStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${STATUS_TEXT[status]} dark:text-foreground/80`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TodayShiftsCard({
  shifts,
  nextShiftId,
  onAttend,
  onViewPatient,
  onEditObs,
  onSelectShift,
}: TodayShiftsCardProps) {
  const [tab, setTab] = useState<TabKey>("todos");

  const counts = useMemo(() => {
    const todos = shifts.length;
    const porAtender = shifts.filter((s) => s.status === "PENDING" || s.status === "CONFIRMED").length;
    const atendidos = shifts.filter((s) => s.status === "FINISHED").length;
    const ausentes = shifts.filter((s) => s.status === "ABSENT").length;
    return { todos, porAtender, atendidos, ausentes };
  }, [shifts]);

  const filtered = useMemo(() => {
    switch (tab) {
      case "porAtender":
        return shifts.filter((s) => s.status === "PENDING" || s.status === "CONFIRMED");
      case "atendidos":
        return shifts.filter((s) => s.status === "FINISHED");
      case "ausentes":
        return shifts.filter((s) => s.status === "ABSENT");
      default:
        return shifts;
    }
  }, [shifts, tab]);

  // Detect a lunch break gap (≥ 60 min between consecutive shifts) and inject a separator row.
  const rows = useMemo(() => {
    const out: Array<
      | { kind: "shift"; shift: DashboardShift }
      | { kind: "break"; from: string; to: string }
    > = [];
    const sorted = [...filtered].sort((a, b) => +new Date(a.start) - +new Date(b.start));
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (i > 0) {
        const prev = sorted[i - 1];
        const gap = +new Date(cur.start) - +new Date(prev.end);
        if (gap >= 60 * 60 * 1000) {
          out.push({ kind: "break", from: formatTime(prev.end), to: formatTime(cur.start) });
        }
      }
      out.push({ kind: "shift", shift: cur });
    }
    return out;
  }, [filtered]);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Turnos de hoy
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="h-9 gap-0.5 rounded-xl border bg-muted/50 p-1">
            {(
              [
                { key: "todos",      label: "Todos",      count: counts.todos },
                { key: "porAtender", label: "Por atender", count: counts.porAtender },
                { key: "atendidos",  label: "Atendidos",  count: counts.atendidos },
                { key: "ausentes",   label: "Ausentes",   count: counts.ausentes },
              ] as const
            ).map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="group/tab h-7 gap-2 rounded-lg border border-transparent px-3 text-[13px] font-medium text-muted-foreground transition data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                <span>{t.label}</span>
                <span className="grid min-w-[20px] place-items-center rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-bold leading-none tabular-nums text-muted-foreground group-data-[state=active]/tab:bg-primary/10 group-data-[state=active]/tab:text-primary">
                  {t.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <CalendarDays className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">No hay turnos en esta categoría</p>
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((row, idx) => {
            if (row.kind === "break") {
              return (
                <li key={`break-${idx}`} className="bg-muted/30 px-5 py-1.5">
                  <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    <span>Pausa · {row.from} a {row.to}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </li>
              );
            }
            const s = row.shift;
            const isNext = nextShiftId === s.id;
            return (
              <li
                key={s.id}
                onClick={() => onSelectShift?.(s)}
                className={`relative px-5 py-3 transition-colors ${
                  onSelectShift ? "cursor-pointer" : ""
                } ${isNext ? "bg-primary/5" : "hover:bg-muted/30"}`}
              >
                {isNext && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary"
                  />
                )}
                <div className="flex items-start gap-4">
                  {/* Time column */}
                  <div className="w-16 shrink-0">
                    <div className="text-sm font-semibold tabular-nums text-foreground">
                      {formatTime(s.start)}
                    </div>
                    <div className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">
                      {s.durationMinutes} min · hasta
                      <br />
                      {formatTime(s.end)}
                    </div>
                  </div>

                  {/* Main info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-foreground">
                        {s.patient ? `${s.patient.firstName} ${s.patient.lastName}` : "Paciente"}
                      </span>
                      {isNext && (
                        <span className="rounded-md bg-primary px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary-foreground">
                          Próximo
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted-foreground">
                      <span>{s.consultationType?.name ?? "Consulta"}</span>
                      {s.patient?.os?.name && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <OsBadge name={s.patient.os.name} />
                        </>
                      )}
                      {s.observations && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="truncate text-foreground/70">{s.observations}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status + actions */}
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <StatusBadge status={s.status} />
                    {isNext && (
                      <div className="flex items-center gap-0.5 ml-1">
                        <button
                          type="button"
                          title="Atender"
                          aria-label="Atender"
                          onClick={() => onAttend(s)}
                          className="grid h-7 w-7 place-items-center rounded-md border bg-card text-foreground/70 transition hover:bg-muted hover:text-foreground"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Ver ficha"
                          aria-label="Ver ficha"
                          onClick={() => s.patient && onViewPatient(s.patient.id)}
                          className="grid h-7 w-7 place-items-center rounded-md border bg-card text-foreground/70 transition hover:bg-muted hover:text-foreground"
                        >
                          <UserIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Editar nota"
                          aria-label="Editar nota"
                          onClick={() => onEditObs(s)}
                          className="grid h-7 w-7 place-items-center rounded-md border bg-card text-foreground/70 transition hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
