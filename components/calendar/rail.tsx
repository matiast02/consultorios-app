"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Phone, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Shift } from "@/types";
import {
  STATE_BAR_CLASS,
  STATE_STAT_NUM_CLASS,
  capitalize,
  formatTime,
  isSameDay,
  shiftToState,
} from "./calendar-helpers";

interface RailProps {
  anchor: Date;
  selectedDay: Date;
  today: Date;
  allMonthShifts: Shift[];
  /** Already filtered shifts for the selected day (toolbar filters applied). */
  selectedDayShifts: Shift[];
  selectedShiftId?: string | null;
  isStaff: boolean;
  hasSelectedMedic: boolean;
  onSelectDay: (d: Date) => void;
  onMonthChange: (d: Date) => void;
  onSelectShift: (s: Shift) => void;
  onCreateOpen: (date: Date) => void;
}

export function Rail({
  anchor,
  selectedDay,
  today,
  allMonthShifts,
  selectedDayShifts,
  selectedShiftId,
  onSelectDay,
  onMonthChange,
  onSelectShift,
  onCreateOpen,
}: RailProps) {
  const isToday = isSameDay(selectedDay, today);

  const stats = useMemo(() => {
    let total = 0;
    let proximos = 0;
    let finalizados = 0;
    let ausentes = 0;
    for (const s of selectedDayShifts) {
      total += 1;
      const st = shiftToState(s);
      if (st === "pendiente" || st === "confirmado" || st === "sobreturno") proximos += 1;
      else if (st === "finalizado") finalizados += 1;
      else if (st === "ausente") ausentes += 1;
    }
    return { total, proximos, finalizados, ausentes };
  }, [selectedDayShifts]);

  // Sort selected day shifts by time (defensive — page may also sort).
  const sortedDayShifts = useMemo(
    () =>
      [...selectedDayShifts].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      ),
    [selectedDayShifts]
  );

  // "Próximo turno" = next non-finalised/cancelled/ausente shift today >= now.
  const nextShift = useMemo(() => {
    if (!isToday) return sortedDayShifts[0] ?? null;
    const now = Date.now();
    return (
      sortedDayShifts.find((s) => {
        const st = shiftToState(s);
        return (
          new Date(s.start).getTime() >= now &&
          (st === "pendiente" || st === "confirmado" || st === "sobreturno")
        );
      }) ?? null
    );
  }, [isToday, sortedDayShifts]);

  return (
    <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-[78px]">
      {/* Mini calendar */}
      <div className="rounded-[10px] border bg-card p-4 shadow-xs">
        <MiniCalendar
          anchor={anchor}
          selectedDay={selectedDay}
          today={today}
          shifts={allMonthShifts}
          onSelectDay={onSelectDay}
          onMonthChange={onMonthChange}
        />
      </div>

      {/* Day stats */}
      <div className="rounded-[10px] border bg-card p-4 shadow-xs">
        <h4 className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          <span className="first-letter:uppercase">
            {isToday ? "Hoy · " : ""}
            {capitalize(
              selectedDay.toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })
            )}
          </span>
        </h4>
        <div className="grid grid-cols-4">
          <RailStat label="Total" value={stats.total} />
          <RailStat
            label="Próximos"
            value={stats.proximos}
            tone={STATE_STAT_NUM_CLASS.pendiente}
            divider
          />
          <RailStat
            label="Hechos"
            value={stats.finalizados}
            tone={STATE_STAT_NUM_CLASS.finalizado}
            divider
          />
          <RailStat
            label="Ausentes"
            value={stats.ausentes}
            tone={STATE_STAT_NUM_CLASS.ausente}
            divider
          />
        </div>
      </div>

      {/* Next turno card */}
      {nextShift && isToday && (
        <div className="overflow-hidden rounded-[10px] bg-gradient-to-br from-[#0a8a9e] to-[#0d5d6c] p-4 text-white shadow-sm">
          <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/70">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
            </span>
            Próximo turno
          </div>
          <div className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">
            {formatTime(new Date(nextShift.start))}
          </div>
          <div className="text-[12.5px] text-white/75">
            {formatEta(new Date(nextShift.start))} ·{" "}
            {Math.round(
              (new Date(nextShift.end).getTime() -
                new Date(nextShift.start).getTime()) /
                60000
            )}{" "}
            min
          </div>
          <div className="mt-2 text-[14px] font-semibold">
            {nextShift.patient
              ? `${nextShift.patient.lastName}, ${nextShift.patient.firstName}`
              : "Paciente"}
          </div>
          <div className="text-[12px] text-white/70">
            {[
              nextShift.consultationType?.name,
              nextShift.patient?.os?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => onSelectShift(nextShift)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-white/20"
            >
              <User className="h-3.5 w-3.5" />
              Ver ficha
            </button>
            {nextShift.patient?.telephone && (
              <a
                href={`tel:${nextShift.patient.telephone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-white/20"
              >
                <Phone className="h-3.5 w-3.5" />
                Llamar
              </a>
            )}
          </div>
        </div>
      )}

      {/* Day list */}
      <div className="rounded-[10px] border bg-card p-4 shadow-xs">
        <h4 className="mb-2.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          <span>Turnos del día</span>
          <span className="text-[14px] font-bold text-foreground">
            {sortedDayShifts.length}
          </span>
        </h4>
        {sortedDayShifts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-[12.5px] text-muted-foreground">
              Sin turnos para este día.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCreateOpen(selectedDay)}
            >
              <Plus className="mr-1.5 h-3 w-3" />
              Crear turno
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedDayShifts.map((s) => {
              const state = shiftToState(s);
              const selected = selectedShiftId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectShift(s)}
                  className={`flex items-center gap-2.5 rounded-[9px] border p-2.5 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                  }`}
                >
                  <span
                    className={`block w-[3px] self-stretch rounded ${STATE_BAR_CLASS[state]}`}
                  />
                  <span className="min-w-[50px] text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                    {formatTime(new Date(s.start))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-foreground">
                      {s.patient
                        ? `${s.patient.lastName}, ${s.patient.firstName?.[0] ?? ""}.`
                        : "Paciente"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[s.consultationType?.name, s.patient?.os?.name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Stat cell ────────────────────────────────────────────────────────────────

function RailStat({
  label,
  value,
  tone,
  divider,
}: {
  label: string;
  value: number;
  tone?: string;
  divider?: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-0.5 px-2 first:pl-0 last:pr-0">
      {divider && (
        <span className="absolute left-0 top-2 bottom-2 w-px bg-border" />
      )}
      <span
        className={`text-[20px] font-bold tabular-nums leading-none tracking-tight ${tone ?? "text-foreground"}`}
      >
        {value}
      </span>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

const MC_DOWS = ["L", "M", "X", "J", "V", "S", "D"];

function MiniCalendar({
  anchor,
  selectedDay,
  today,
  shifts,
  onSelectDay,
  onMonthChange,
}: {
  anchor: Date;
  selectedDay: Date;
  today: Date;
  shifts: Shift[];
  onSelectDay: (d: Date) => void;
  onMonthChange: (d: Date) => void;
}) {
  const cells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const firstDow = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0
    ).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++)
      out.push(new Date(anchor.getFullYear(), anchor.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [anchor]);

  // Pre-compute a Set of YYYY-MM-DD strings that have at least one shift.
  const daysWithShifts = useMemo(() => {
    const s = new Set<string>();
    for (const sh of shifts) {
      const d = new Date(sh.start);
      s.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return s;
  }, [shifts]);

  const monthName = capitalize(
    anchor.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
  );

  return (
    <div>
      {/* Head — title + nav buttons (`.mini-cal-head` + `.mini-cal-nav button`) */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[14px] font-semibold text-[#0b2233]">{monthName}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() =>
              onMonthChange(
                new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
              )
            }
            className="grid h-[26px] w-[26px] place-items-center rounded-md border border-[#dfe9ec] bg-white text-[#1f3a4d] transition-colors hover:bg-[#f8fbfb]"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() =>
              onMonthChange(
                new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
              )
            }
            className="grid h-[26px] w-[26px] place-items-center rounded-md border border-[#dfe9ec] bg-white text-[#1f3a4d] transition-colors hover:bg-[#f8fbfb]"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* DOW header row */}
      <div className="grid grid-cols-7 gap-[2px]">
        {MC_DOWS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#94a8b3]"
          >
            {d}
          </div>
        ))}

        {/* Day cells — `.mc-cell` aspect-1 rounded-[7px] bg-surface-2 */}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const isT = isSameDay(d, today);
          const isS = !isT && isSameDay(d, selectedDay);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const hasShift = daysWithShifts.has(
            `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          );
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(d)}
              className={`relative grid aspect-square place-items-center rounded-[7px] text-[12.5px] tabular-nums transition-colors ${
                isT
                  ? "bg-primary font-bold text-primary-foreground"
                  : isS
                    ? "bg-[#e3f3f5] font-semibold text-[#054b58]"
                    : isWeekend
                      ? "bg-[#f8fbfb] font-medium text-[#94a8b3] hover:bg-[#e3f3f5] hover:text-[#054b58]"
                      : "bg-[#f8fbfb] font-medium text-[#1f3a4d] hover:bg-[#e3f3f5] hover:text-[#054b58]"
              }`}
            >
              {d.getDate()}
              {hasShift && (
                <span
                  className={`absolute bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isT ? "bg-white" : "bg-primary"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── ETA formatter ────────────────────────────────────────────────────────────

function formatEta(when: Date): string {
  const mins = Math.round((when.getTime() - Date.now()) / 60000);
  if (mins <= 0) return "ahora";
  if (mins < 60) return `en ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `en ${h} h${m ? ` ${m} min` : ""}`;
}
