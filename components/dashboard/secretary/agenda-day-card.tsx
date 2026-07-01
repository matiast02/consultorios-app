"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Pin, Search, Sun, Moon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgendaAutoMode, SecretaryAgendaData } from "@/types";
import { AgendaModeRails } from "./agenda-mode-rails";
import { AgendaModeColumnsCompact } from "./agenda-mode-columns-compact";
import { AgendaModeColumnsDetailed } from "./agenda-mode-columns-detailed";

interface AgendaDayCardProps {
  data: SecretaryAgendaData;
  onShiftClick?: (shiftId: string) => void;
}

type ModeChoice = "auto" | "columns" | "rails";
type SegFilter = "all" | "AM" | "PM";

export function AgendaDayCard({ data, onShiftClick }: AgendaDayCardProps) {
  const [mode, setMode] = useState<ModeChoice>("auto");
  const [segment, setSegment] = useState<SegFilter>("all");
  const [search, setSearch] = useState("");
  const [filterWaiting, setFilterWaiting] = useState(false);
  const [filterFreeSlots, setFilterFreeSlots] = useState(false);
  const [filterPinned, setFilterPinned] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [visible, setVisible] = useState<Set<string>>(() => new Set(data.profesionales.map((p) => p.id)));

  const togglePin = (id: string) => {
    setPinned((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Apply pinned overlay (pinned in our local state override server's isPinned)
  const decorated = useMemo(
    () => data.profesionales.map((p) => ({ ...p, isPinned: p.isPinned || pinned.has(p.id) })),
    [data.profesionales, pinned],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return decorated.filter((p) => {
      if (!visible.has(p.id)) return false;
      if (filterWaiting && !p.hasWaitingPatients) return false;
      if (filterFreeSlots && !p.hasFreeSlots) return false;
      if (filterPinned && !p.isPinned) return false;
      if (segment === "AM" && !p.turnSegments.includes("AM")) return false;
      if (segment === "PM" && !p.turnSegments.includes("PM")) return false;
      if (q && !(p.shortName.toLowerCase().includes(q) || (p.especialidad ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [decorated, visible, filterWaiting, filterFreeSlots, filterPinned, segment, search]);

  const visibleShifts = filtered.reduce((acc, p) => acc + p.shifts.length, 0);
  const waitingCount = decorated.filter((p) => p.hasWaitingPatients).length;
  const freeSlotsCount = decorated.filter((p) => p.hasFreeSlots).length;
  const pinnedCount = decorated.filter((p) => p.isPinned).length;
  const amOnly = decorated.filter((p) => p.turnSegments.includes("AM") && !p.turnSegments.includes("PM"));
  const pmOnly = decorated.filter((p) => p.turnSegments.includes("PM") && !p.turnSegments.includes("AM"));
  const fullDay = decorated.filter((p) => p.turnSegments.includes("AM") && p.turnSegments.includes("PM"));
  const pinnedList = decorated.filter((p) => p.isPinned);

  const effectiveMode: AgendaAutoMode =
    mode === "columns"
      ? filtered.length <= 2
        ? "columns-detailed"
        : "columns-compact"
      : mode === "rails"
        ? "rails"
        : filtered.length <= 2
          ? "columns-detailed"
          : filtered.length <= 5
            ? "columns-compact"
            : "rails";

  const modeFooter =
    effectiveMode === "rails"
      ? "Carriles"
      : effectiveMode === "columns-detailed"
        ? "Columnas (detallado)"
        : "Columnas (compacto)";

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Agenda del día <span className="text-muted-foreground">· {decorated.length} profesionales</span>
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5 text-[12.5px] font-medium">
          {(["auto", "columns", "rails"] as const).map((m) => {
            const label = m === "auto" ? "Auto" : m === "columns" ? "Columnas" : "Carriles";
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  active
                    ? "rounded-md bg-foreground px-2.5 py-1 text-card shadow-sm"
                    : "rounded-md px-2.5 py-1 text-muted-foreground transition hover:text-foreground"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 border-b px-5 py-3">
        {/* Search + segment tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar profesional o especialidad…"
              className="w-full rounded-lg border bg-card pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/30"
            />
          </div>
          <Tabs value={segment} onValueChange={(v) => setSegment(v as SegFilter)}>
            <TabsList className="h-8 gap-0.5 rounded-lg border bg-muted/50 p-0.5">
              {(
                [
                  { key: "all", label: "Todos" },
                  { key: "AM", label: "Mañana" },
                  { key: "PM", label: "Tarde" },
                ] as const
              ).map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="h-6 rounded-md px-2.5 text-[12px] font-medium text-muted-foreground transition data-[state=active]:bg-foreground data-[state=active]:text-card"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <FilterChip
            label="Con pacientes esperando"
            count={waitingCount}
            active={filterWaiting}
            onToggle={() => setFilterWaiting((v) => !v)}
          />
          <FilterChip
            label="Con huecos hoy"
            count={freeSlotsCount}
            active={filterFreeSlots}
            onToggle={() => setFilterFreeSlots((v) => !v)}
          />
          <FilterChip
            label="Mis pinned"
            count={pinnedCount}
            active={filterPinned}
            onToggle={() => setFilterPinned((v) => !v)}
            icon={<Pin className="h-3 w-3" />}
          />
        </div>

        {/* Counters + select-all/none */}
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground tabular-nums">{filtered.length}</span> visibles ·{" "}
            <span className="font-semibold text-foreground tabular-nums">{visibleShifts}</span> turnos
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setVisible(new Set(data.profesionales.map((p) => p.id)))}
              className="font-medium text-[#0d4f4d] hover:underline"
            >
              Mostrar todos
            </button>
            <button
              type="button"
              onClick={() => setVisible(new Set())}
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              Ninguno
            </button>
          </div>
        </div>
      </div>

      {/* Professional chip groups */}
      <div className="space-y-2.5 border-b px-5 py-3">
        {pinnedList.length > 0 && (
          <ChipGroup
            title="Pinned"
            icon={<Pin className="h-3 w-3" />}
            count={pinnedList.length}
            profesionales={pinnedList}
            visible={visible}
            onToggleVisible={(id) =>
              setVisible((cur) => {
                const next = new Set(cur);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onTogglePin={togglePin}
            pinned={pinned}
          />
        )}
        <ChipGroup
          title="Mañana · 08-13"
          icon={<Sun className="h-3 w-3" />}
          count={amOnly.length}
          profesionales={amOnly}
          visible={visible}
          onToggleVisible={(id) =>
            setVisible((cur) => {
              const next = new Set(cur);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onTogglePin={togglePin}
          pinned={pinned}
        />
        <ChipGroup
          title="Tarde · 14-18"
          icon={<Moon className="h-3 w-3" />}
          count={pmOnly.length}
          profesionales={pmOnly}
          visible={visible}
          onToggleVisible={(id) =>
            setVisible((cur) => {
              const next = new Set(cur);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onTogglePin={togglePin}
          pinned={pinned}
        />
        {fullDay.length > 0 && (
          <ChipGroup
            title="Jornada completa"
            icon={null}
            count={fullDay.length}
            profesionales={fullDay}
            visible={visible}
            onToggleVisible={(id) =>
              setVisible((cur) => {
                const next = new Set(cur);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onTogglePin={togglePin}
            pinned={pinned}
          />
        )}
      </div>

      {/* Body — picked mode */}
      <div className="p-4">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No hay profesionales para los filtros actuales.
          </div>
        ) : effectiveMode === "rails" ? (
          <AgendaModeRails profesionales={filtered} onShiftClick={onShiftClick} />
        ) : effectiveMode === "columns-detailed" ? (
          <AgendaModeColumnsDetailed profesionales={filtered} onShiftClick={onShiftClick} />
        ) : (
          <AgendaModeColumnsCompact profesionales={filtered} onShiftClick={onShiftClick} />
        )}
      </div>

      {/* Footer legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-2.5 text-[11.5px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <LegendDot color="bg-emerald-500" label="Finalizado" />
          <LegendDot color="bg-sky-500" label="Confirmado" />
          <LegendDot color="bg-amber-500" label="Pendiente" />
          <LegendDot color="bg-rose-500" label="Ausente" />
        </div>
        <span>
          Vista: <span className="font-medium text-foreground">{modeFooter}</span>
          {mode === "auto" ? <span className="text-muted-foreground/70"> (auto)</span> : null}
          {" · "}
          <span className="text-foreground tabular-nums">{filtered.length}</span> de{" "}
          <span className="tabular-nums">{decorated.length}</span> profesionales{" "}
          · <span className="tabular-nums">{visibleShifts}</span> turnos
        </span>
      </div>
    </div>
  );
}

// ─── Internals ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  onToggle,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full border border-[#0d4f4d] bg-[#0d4f4d]/10 px-2.5 py-1 font-medium text-[#0d4f4d]"
          : "inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 font-medium text-muted-foreground transition hover:bg-muted"
      }
    >
      {icon}
      <span>{label}</span>
      <span className="rounded-full bg-foreground/5 px-1.5 text-[10.5px] font-bold tabular-nums">{count}</span>
    </button>
  );
}

function ChipGroup({
  title,
  icon,
  count,
  profesionales,
  visible,
  onToggleVisible,
  onTogglePin,
  pinned,
}: {
  title: string;
  icon: React.ReactNode | null;
  count: number;
  profesionales: import("@/types").AgendaProfessional[];
  visible: Set<string>;
  onToggleVisible: (id: string) => void;
  onTogglePin: (id: string) => void;
  pinned: Set<string>;
}) {
  if (profesionales.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums">{count}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {profesionales.map((p) => {
          const isVisible = visible.has(p.id);
          const isPinned = pinned.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggleVisible(p.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onTogglePin(p.id);
              }}
              title={isVisible ? "Click para ocultar · click derecho para pin" : "Click para mostrar · click derecho para pin"}
              className={
                isVisible
                  ? "inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-1 text-[12px] font-medium text-foreground transition hover:bg-muted"
                  : "inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-1 text-[12px] font-medium text-muted-foreground/70 line-through transition hover:bg-muted"
              }
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: p.dotColor ?? "#64748b" }}
              />
              <span>{p.shortName}</span>
              {p.especialidad && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-muted-foreground">{p.especialidad}</span>
                </>
              )}
              <span className="ml-0.5 grid min-w-[18px] place-items-center rounded-full bg-amber-100 px-1 py-0.5 text-[9.5px] font-bold tabular-nums text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {p.shifts.length}
              </span>
              {isPinned && <Pin className="h-2.5 w-2.5 text-foreground/60" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
