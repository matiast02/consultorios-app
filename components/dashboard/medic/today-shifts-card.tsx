"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Megaphone, User as UserIcon, Pencil, RotateCcw, Search, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OsBadge } from "./os-badge";
import type { DashboardShift, ShiftStatus } from "@/types";
import { formatTicketNumber } from "@/lib/waiting-room/format";

interface TodayShiftsCardProps {
  shifts: DashboardShift[];
  nextShiftId: string | null;
  onAttend: (shift: DashboardShift) => void;
  onViewPatient: (patientId: string) => void;
  onEditObs: (shift: DashboardShift) => void;
  /** Click on a shift row (anywhere outside the quick-action buttons). */
  onSelectShift?: (shift: DashboardShift) => void;
  /** Módulo waiting_room activo: «Llamar» para los pacientes en sala y «Volver a llamar» en consulta. */
  waitingRoomEnabled?: boolean;
  onCall?: (shift: DashboardShift) => void;
  onRecall?: (shift: DashboardShift) => void;
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

/** A partir de cuántos turnos aparece el buscador (con menos, la lista se recorre de un vistazo). */
const SEARCH_MIN_SHIFTS = 8;

/** Minúsculas y sin acentos: "Gómez" coincide con "gomez". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function shiftMatches(s: DashboardShift, q: string): boolean {
  const first = s.patient?.firstName ?? "";
  const last = s.patient?.lastName ?? "";
  const haystack = normalize(`${first} ${last} ${last} ${first} ${s.patient?.os?.name ?? ""}`);
  return haystack.includes(q);
}

const ACTIVE_STATUSES: ShiftStatus[] = ["PENDING", "CONFIRMED"];

/** Llegó y todavía no pasó a consulta. */
function inWaitingRoom(s: DashboardShift): boolean {
  return !!s.arrivedAt && !s.consultationStartedAt && ACTIVE_STATUSES.includes(s.status);
}

/** Ya fue llamado / pasó a consulta y el turno sigue abierto. */
function inConsultation(s: DashboardShift): boolean {
  return !!s.consultationStartedAt && ACTIVE_STATUSES.includes(s.status);
}

/** Estado de sala de espera del turno (recepción registra llegadas; el número es del módulo waiting_room). */
function WaitingBadge({ shift: s }: { shift: DashboardShift }) {
  if (inWaitingRoom(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        En sala
        {s.ticketNumber != null && <> · N.º {formatTicketNumber(s.ticketNumber)}</>}
        {s.minutesWaiting != null && <> · {s.minutesWaiting} min</>}
      </span>
    );
  }
  if (inConsultation(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
        En consulta
        {s.ticketNumber != null && <> · N.º {formatTicketNumber(s.ticketNumber)}</>}
        {s.consultationStartedAt && <> · {formatTime(s.consultationStartedAt)}</>}
      </span>
    );
  }
  return null;
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
  waitingRoomEnabled = false,
  onCall,
  onRecall,
}: TodayShiftsCardProps) {
  // Arranca en "Por atender" (lo que importa durante la jornada); si ya no
  // queda nada por atender, en "Todos" para no mostrar una lista vacía.
  const [tab, setTab] = useState<TabKey>(() =>
    shifts.some((s) => s.status === "PENDING" || s.status === "CONFIRMED") ? "porAtender" : "todos",
  );
  const [query, setQuery] = useState("");
  const showSearch = shifts.length >= SEARCH_MIN_SHIFTS;
  const q = showSearch ? normalize(query.trim()) : "";

  const counts = useMemo(() => {
    const todos = shifts.length;
    const porAtender = shifts.filter((s) => s.status === "PENDING" || s.status === "CONFIRMED").length;
    const atendidos = shifts.filter((s) => s.status === "FINISHED").length;
    const ausentes = shifts.filter((s) => s.status === "ABSENT").length;
    return { todos, porAtender, atendidos, ausentes };
  }, [shifts]);

  const filtered = useMemo(() => {
    let list: DashboardShift[];
    switch (tab) {
      case "porAtender":
        list = shifts.filter((s) => s.status === "PENDING" || s.status === "CONFIRMED");
        break;
      case "atendidos":
        list = shifts.filter((s) => s.status === "FINISHED");
        break;
      case "ausentes":
        list = shifts.filter((s) => s.status === "ABSENT");
        break;
      default:
        list = shifts;
    }
    return q ? list.filter((s) => shiftMatches(s, q)) : list;
  }, [shifts, tab, q]);

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
        <div className="flex flex-wrap items-center gap-2">
          {showSearch && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
                placeholder="Buscar paciente u obra social"
                aria-label="Buscar en los turnos de hoy por nombre, apellido u obra social"
                className="h-9 w-60 rounded-xl border bg-muted/50 pl-8 pr-8 text-[13px] text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
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
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {q ? (
              <Search className="h-5 w-5 text-muted-foreground/60" />
            ) : (
              <CalendarDays className="h-5 w-5 text-muted-foreground/60" />
            )}
          </div>
          {q ? (
            <>
              <p className="mt-3 text-sm font-medium text-foreground">
                Ningún turno coincide con «{query.trim()}»
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-2 text-[12.5px] font-medium text-primary hover:underline"
              >
                Limpiar búsqueda
              </button>
            </>
          ) : (
            <p className="mt-3 text-sm font-medium text-foreground">No hay turnos en esta categoría</p>
          )}
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
                      <WaitingBadge shift={s} />
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
                    {waitingRoomEnabled && onCall && inWaitingRoom(s) && (
                      <button
                        type="button"
                        onClick={() => onCall(s)}
                        className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-[#0d4f4d] px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-[#0a3f3d]"
                      >
                        <Megaphone className="h-3 w-3" />
                        Llamar
                      </button>
                    )}
                    {waitingRoomEnabled && onRecall && inConsultation(s) && s.ticketNumber != null && (
                      <button
                        type="button"
                        title="Volver a llamar"
                        aria-label="Volver a llamar"
                        onClick={() => onRecall(s)}
                        className="ml-1 grid h-7 w-7 place-items-center rounded-md border bg-card text-foreground/70 transition hover:bg-muted hover:text-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
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
