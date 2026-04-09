"use client";

import type { Shift } from "@/types";
import {
  SHIFT_STATUS_DOT_COLORS,
  SHIFT_STATUS_COLORS,
  SHIFT_STATUS_LABELS,
  DAY_NAMES,
} from "@/types";
import { formatTime } from "./calendar-helpers";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MonthViewProps {
  calendarDays: (number | null)[];
  year: number;
  month: number;
  getShiftsForDay: (day: number) => Shift[];
  isDayBlocked: (day: number) => boolean;
  isToday: (day: number) => boolean;
  isSelected: (day: number) => boolean;
  onSelectDay: (day: number) => void;
  showMedicInitials?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthView({
  calendarDays,
  year,
  month,
  getShiftsForDay,
  isDayBlocked,
  isToday,
  isSelected,
  onSelectDay,
  showMedicInitials,
}: MonthViewProps) {
  return (
    <>
      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 gap-px">
        {DAY_NAMES.map((dayName) => (
          <div
            key={dayName}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {dayName.substring(0, 3)}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[80px]" />;
          }
          const dayShifts = getShiftsForDay(day);
          const blocked = isDayBlocked(day);
          return (
            <button
              key={day}
              onClick={() => onSelectDay(day)}
              className={`min-h-[80px] rounded-md border p-1 text-left transition-all duration-150 hover:bg-primary/5 ${
                isSelected(day)
                  ? "border-primary bg-primary/8"
                  : "border-transparent"
              } ${isToday(day) ? "bg-accent/60" : ""} ${
                blocked ? "bg-amber-50 dark:bg-amber-950/20" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  {day}
                </span>
                {blocked && (
                  <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase">
                    Bloq.
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayShifts.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <div
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${SHIFT_STATUS_DOT_COLORS[s.status]}`}
                    />
                    <span className="truncate text-[10px] text-muted-foreground">
                      {s.recurrenceGroupId && (
                        <span className="mr-0.5 text-blue-400">↻</span>
                      )}
                      {s.isOverbook && (
                        <span className="mr-0.5 font-bold text-amber-500">ST</span>
                      )}
                      {showMedicInitials && s.user?.lastName
                        ? `${s.user.lastName.substring(0, 3)}. `
                        : ""}
                      {formatTime(new Date(s.start))}
                    </span>
                  </div>
                ))}
                {dayShifts.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{dayShifts.length - 3} mas
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
