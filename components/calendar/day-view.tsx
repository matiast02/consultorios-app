"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Shift } from "@/types";
import { SHIFT_STATUS_COLORS, SHIFT_STATUS_LABELS } from "@/types";
import { DroppableSlot, DraggableShift } from "./dnd-helpers";
import { HOUR_SLOTS, pad, formatTime, dateToYMD } from "./calendar-helpers";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DayViewProps {
  date: Date;
  shifts: Shift[];
  isBlocked: boolean;
  isWithinWorkHours: (hour: number) => boolean;
  getShiftPosition: (shift: Shift) => { top: number; height: number };
  onSlotClick: (hour: number) => void;
  onShiftClick: (shift: Shift) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DayView({
  date,
  shifts,
  isBlocked,
  isWithinWorkHours,
  getShiftPosition,
  onSlotClick,
  onShiftClick,
}: DayViewProps) {
  return (
    <div>
      {isBlocked && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Este dia esta bloqueado</span>
        </div>
      )}

      <div className="relative">
        {/* Time grid */}
        <div className="grid grid-cols-[60px_1fr]">
          {/* Time labels */}
          <div>
            {HOUR_SLOTS.map((hour) => (
              <div
                key={hour}
                className="relative h-16 border-b pr-2 text-right"
              >
                <span className="absolute -top-2 right-2 text-xs text-muted-foreground">
                  {pad(hour)}:00
                </span>
              </div>
            ))}
          </div>

          {/* Main column */}
          <div className="relative border-l">
            {/* Hour slots (droppable) */}
            {HOUR_SLOTS.map((hour) => {
              const withinWork = isWithinWorkHours(hour);
              const slotId = `slot-${dateToYMD(date)}-${hour}`;
              return (
                <DroppableSlot
                  key={hour}
                  id={slotId}
                  onClick={() => !isBlocked && onSlotClick(hour)}
                  className={`h-16 border-b cursor-pointer transition-colors hover:bg-accent/50 ${
                    isBlocked
                      ? "bg-amber-50 dark:bg-amber-950/20"
                      : withinWork
                      ? "bg-card dark:bg-background"
                      : "bg-muted/40 dark:bg-muted/20"
                  }`}
                />
              );
            })}

            {/* Shift blocks (draggable) */}
            {shifts.map((shift) => {
              const pos = getShiftPosition(shift);
              const totalHeight = HOUR_SLOTS.length * 64; // 64px = h-16
              const topPx = (pos.top / 100) * totalHeight;
              const heightPx = Math.max(
                (pos.height / 100) * totalHeight,
                28
              );

              return (
                <DraggableShift
                  key={shift.id}
                  shift={shift}
                  onClick={(e) => {
                    e.stopPropagation();
                    onShiftClick(shift);
                  }}
                  className={`absolute left-1 right-1 rounded-md border px-2 py-1 overflow-hidden transition-opacity hover:opacity-80 ${shift.isOverbook ? "border-amber-500 border-dashed" : ""} ${SHIFT_STATUS_COLORS[shift.status]}`}
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">
                      {shift.isOverbook && (
                        <Badge variant="outline" className="mr-1 text-[9px] border-amber-500 text-amber-600 px-1 py-0">
                          ST
                        </Badge>
                      )}
                      {shift.patient
                        ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                        : "Paciente"}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${SHIFT_STATUS_COLORS[shift.status]}`}
                    >
                      {SHIFT_STATUS_LABELS[shift.status]}
                    </Badge>
                  </div>
                  <p className="text-[11px] mt-0.5">
                    {formatTime(new Date(shift.start))} -{" "}
                    {formatTime(new Date(shift.end))}
                  </p>
                  {shift.observations && heightPx > 50 && (
                    <p className="text-[10px] mt-0.5 truncate opacity-80">
                      {shift.observations}
                    </p>
                  )}
                </DraggableShift>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
