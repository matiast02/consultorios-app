"use client";

import type { Shift } from "@/types";
import { SHIFT_STATUS_COLORS, DAY_NAMES } from "@/types";
import { DroppableSlot, DraggableShift } from "./dnd-helpers";
import { HOUR_SLOTS, pad, formatTime, dateToYMD } from "./calendar-helpers";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface WeekViewProps {
  weekDays: Date[];
  getShiftsForDay: (date: Date) => Shift[];
  isDayBlocked: (date: Date) => boolean;
  isToday: (date: Date) => boolean;
  isSelected: (date: Date) => boolean;
  isWithinWorkHours: (dayOfWeek: number, hour: number) => boolean;
  getShiftPosition: (shift: Shift) => { top: number; height: number };
  onSelectDay: (date: Date) => void;
  onSlotClick: (date: Date, hour: number) => void;
  onShiftClick: (shift: Shift) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeekView({
  weekDays,
  getShiftsForDay,
  isDayBlocked,
  isToday,
  isSelected,
  isWithinWorkHours,
  getShiftPosition,
  onSelectDay,
  onSlotClick,
  onShiftClick,
}: WeekViewProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
          <div /> {/* spacer for time column */}
          {weekDays.map((day) => (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`p-2 text-center border-l transition-colors hover:bg-accent ${
                isSelected(day) ? "bg-accent" : ""
              }`}
            >
              <div className="text-xs text-muted-foreground">
                {DAY_NAMES[day.getDay()].substring(0, 3)}
              </div>
              <div
                className={`mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                  isToday(day)
                    ? "bg-primary text-primary-foreground"
                    : ""
                }`}
              >
                {day.getDate()}
              </div>
              {isDayBlocked(day) && (
                <div className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase">
                  Bloqueado
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {/* Time labels */}
          <div>
            {HOUR_SLOTS.map((hour) => (
              <div
                key={hour}
                className="relative h-14 border-b pr-2 text-right"
              >
                <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">
                  {pad(hour)}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(day);
            const blocked = isDayBlocked(day);

            return (
              <div key={day.toISOString()} className="relative border-l">
                {/* Hour rows (droppable slots) */}
                {HOUR_SLOTS.map((hour) => {
                  const withinWork = isWithinWorkHours(day.getDay(), hour);
                  const slotId = `slot-${dateToYMD(day)}-${hour}`;
                  return (
                    <DroppableSlot
                      key={hour}
                      id={slotId}
                      onClick={() => !blocked && onSlotClick(day, hour)}
                      className={`h-14 border-b cursor-pointer transition-colors hover:bg-accent/50 ${
                        blocked
                          ? "bg-amber-50 dark:bg-amber-950/20"
                          : withinWork
                          ? "bg-card dark:bg-background"
                          : "bg-muted/40 dark:bg-muted/20"
                      }`}
                    />
                  );
                })}

                {/* Shift blocks (draggable, absolutely positioned) */}
                {dayShifts.map((shift) => {
                  const pos = getShiftPosition(shift);
                  const totalHeight = HOUR_SLOTS.length * 56; // 56px = h-14
                  const topPx = (pos.top / 100) * totalHeight;
                  const heightPx = Math.max(
                    (pos.height / 100) * totalHeight,
                    20
                  );

                  return (
                    <DraggableShift
                      key={shift.id}
                      shift={shift}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShiftClick(shift);
                      }}
                      className={`absolute left-0.5 right-0.5 rounded border px-1 py-0.5 text-[10px] overflow-hidden transition-opacity hover:opacity-80 ${shift.isOverbook ? "border-amber-500 border-dashed" : ""} ${SHIFT_STATUS_COLORS[shift.status]}`}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                      }}
                    >
                      <div className="font-medium truncate">
                        {shift.isOverbook && (
                          <span className="mr-0.5 text-amber-600 dark:text-amber-400">ST</span>
                        )}
                        {shift.patient
                          ? `${shift.patient.lastName}`
                          : "Turno"}
                      </div>
                      <div className="truncate">
                        {formatTime(new Date(shift.start))}
                      </div>
                    </DraggableShift>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
