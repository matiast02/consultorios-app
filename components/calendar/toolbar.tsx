"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { STATE_DOT_CLASS, type CalState } from "./calendar-helpers";

export type ViewMode = "mes" | "semana" | "dia" | "agenda";

/** Filter chips include "todos" so we type it separately. */
export type StateFilter = "todos" | CalState;

interface ToolbarProps {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  label: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  stateFilter: StateFilter;
  onStateFilterChange: (f: StateFilter) => void;
}

const VIEWS: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: "mes",    label: "Mes",    icon: CalendarDays },
  { id: "semana", label: "Semana", icon: LayoutGrid },
  { id: "dia",    label: "Día",    icon: Clock },
  { id: "agenda", label: "Agenda", icon: List },
];

const FILTERS: { id: StateFilter; label: string }[] = [
  { id: "todos",      label: "Todos" },
  { id: "pendiente",  label: "Pendiente" },
  { id: "confirmado", label: "Confirmado" },
  { id: "finalizado", label: "Finalizado" },
  { id: "ausente",    label: "Ausente" },
  { id: "sobreturno", label: "Sobreturno" },
];

export function CalendarToolbar({
  view,
  onViewChange,
  label,
  onToday,
  onPrev,
  onNext,
  query,
  onQueryChange,
  stateFilter,
  onStateFilterChange,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Navigation */}
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={onToday}
          className="h-8 rounded-md border bg-card px-3 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-border/80 hover:bg-muted/40"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Anterior"
          className="grid h-8 w-8 place-items-center rounded-md border bg-card text-foreground/70 transition-colors hover:border-border/80 hover:bg-muted/40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Siguiente"
          className="grid h-8 w-8 place-items-center rounded-md border bg-card text-foreground/70 transition-colors hover:border-border/80 hover:bg-muted/40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[160px] text-base font-bold tracking-tight text-foreground first-letter:uppercase">
          {label}
        </span>
      </div>

      {/* Segmented view switcher (`.seg`) */}
      <div className="inline-flex gap-0.5 rounded-[9px] border bg-card p-[3px] shadow-xs">
        {VIEWS.map(({ id, label: l, icon: Icon }) => {
          const on = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                on
                  ? "bg-foreground text-background font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {l}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Search pill */}
      <div className="relative inline-flex items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar paciente o motivo…"
          className="h-8 w-[220px] rounded-md pl-8 pr-7 text-[12.5px]"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Limpiar"
            className="absolute right-2 grid h-4 w-4 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* State filter chips */}
      <div className="inline-flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const on = stateFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onStateFilterChange(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                on
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground/80 hover:border-border/80"
              }`}
            >
              {f.id !== "todos" && (
                <span className={`h-2 w-2 rounded-full ${STATE_DOT_CLASS[f.id]}`} />
              )}
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
