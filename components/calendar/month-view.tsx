"use client";

import { CalendarX } from "lucide-react";
import type { Shift } from "@/types";
import {
  STATE_PILL_CLASS,
  formatTime,
  isSameDay,
  shiftToState,
} from "./calendar-helpers";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CellInfo {
  date: Date;
  otherMonth: boolean;
  shifts: Shift[];
  capacity: number;
  blocked: boolean;
  blockedReason?: string | null;
}

export interface MonthViewProps {
  anchor: Date;
  selectedDay: Date | null;
  today: Date;
  cells: CellInfo[];
  onSelectDay: (d: Date) => void;
  onSelectShift: (s: Shift) => void;
}

const DOWS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthView({
  selectedDay,
  today,
  cells,
  onSelectDay,
  onSelectShift,
}: MonthViewProps) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[#dfe9ec] bg-white shadow-xs">
      {/* Header + cells share a 7-col grid with a 1px gap acting as borders. */}
      <div className="grid grid-cols-7 gap-px bg-[#dfe9ec]">
        {DOWS.map((d) => (
          <div
            key={d}
            className="bg-[#f8fbfb] px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#6c8593]"
          >
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          const day = c.date;
          const dayShifts = c.shifts;
          const cap = c.capacity;
          const occ = dayShifts.length;
          const isToday = isSameDay(day, today);
          const isSelected = selectedDay && isSameDay(day, selectedDay);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const blocked = c.blocked;
          const visible = dayShifts.slice(0, 3);
          const more = dayShifts.length - visible.length;
          const pct = cap > 0 ? Math.min(100, (occ / cap) * 100) : 0;

          const cellBase =
            "relative flex min-h-[130px] cursor-pointer flex-col gap-1 p-2 transition-colors";
          // Tones use the exact design tokens (--surface/-2, --bg-soft, etc.)
          const cellTone = blocked
            ? "bg-[repeating-linear-gradient(-45deg,#fbe7e3_0_6px,#fcedea_6px_12px)]"
            : c.otherMonth
              ? "bg-[#f5f8f9] text-[#94a8b3] hover:bg-[#f1f5f6]"
              : isWeekend
                ? "bg-[#f8fbfb] hover:bg-[#f1f5f6]"
                : "bg-white hover:bg-[#fafdfd]";
          const ring = isSelected ? "shadow-[inset_0_0_0_2px_var(--color-primary)] z-[1]" : "";

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`${cellBase} ${cellTone} ${ring} text-left`}
            >
              {/* Day number + capacity */}
              <div className="flex items-center justify-between gap-1.5">
                {isToday ? (
                  <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">
                    {day.getDate()}
                  </span>
                ) : (
                  <span
                    className={`text-[13px] font-semibold ${c.otherMonth ? "text-[#94a8b3]" : "text-[#1f3a4d]"}`}
                  >
                    {day.getDate()}
                  </span>
                )}
                {cap > 0 && !blocked && !c.otherMonth && (
                  <span className="text-[10.5px] font-medium tabular-nums text-[#94a8b3]">
                    {occ}/{cap}
                  </span>
                )}
              </div>

              {/* Blocked tag */}
              {blocked && c.blockedReason && (
                <span className="inline-flex w-max items-center gap-1 rounded border border-rose-200 bg-card px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-900">
                  <CalendarX className="h-3 w-3" />
                  {c.blockedReason}
                </span>
              )}

              {/* Events */}
              <div className="flex min-h-0 flex-1 flex-col gap-[3px]">
                {visible.map((s) => {
                  const tDate = new Date(s.start);
                  const state = shiftToState(s);
                  const tone = STATE_PILL_CLASS[state];
                  return (
                    <span
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectShift(s);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectShift(s);
                        }
                      }}
                      className={`flex items-center gap-1.5 truncate rounded border-l-[3px] py-[2px] pl-1 pr-1.5 text-[11.5px] leading-[1.4] ${tone}`}
                    >
                      <span className="tabular-nums text-[#6c8593]">
                        {formatTime(tDate)}
                      </span>
                      <span className="truncate font-semibold">
                        {s.patient
                          ? `${s.patient.lastName}, ${s.patient.firstName?.[0] ?? ""}.`
                          : "Turno"}
                      </span>
                    </span>
                  );
                })}
                {more > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDay(day);
                    }}
                    className="rounded px-1 py-0.5 text-left text-[11px] font-semibold text-primary hover:bg-primary/10"
                  >
                    +{more} más
                  </button>
                )}
              </div>

              {/* Capacity bar (under events) — matches `.cell-cap-bar` from design */}
              {cap > 0 && !blocked && !c.otherMonth && (
                <div className="mt-auto h-[3px] overflow-hidden rounded-[2px] bg-[#e6edef]">
                  <div
                    className={`h-full rounded-[2px] ${pct > 75 ? "bg-gradient-to-r from-[#d28b1c] to-[#c0392b]" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
