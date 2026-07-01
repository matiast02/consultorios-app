"use client";

import type { Shift, UserPreference } from "@/types";
import { DraggableShift, DroppableSlot } from "./dnd-helpers";
import {
  HOURS_START,
  HOURS_END,
  STATE_WEEK_CLASS,
  WEEK_HOUR_PX,
  dateToYMD,
  formatTime,
  isSameDay,
  shiftToState,
  toMinutes,
  capacityFromPreference,
  pad,
} from "./calendar-helpers";

const DOWS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface WeekViewProps {
  weekDays: Date[]; // 7 days, Sunday first
  today: Date;
  /** Function returning the work-hour preference for a given weekday (0..6). */
  getPreference: (dayOfWeek: number) => UserPreference | undefined;
  isDayBlocked: (day: Date) => boolean;
  getShiftsForDay: (day: Date) => Shift[];
  selectedShiftId?: string | null;
  onSelectDay: (day: Date) => void;
  onSlotClick: (date: Date, hour: number) => void;
  onSelectShift: (s: Shift) => void;
}

export function WeekView({
  weekDays,
  today,
  getPreference,
  isDayBlocked,
  getShiftsForDay,
  selectedShiftId,
  onSelectDay,
  onSlotClick,
  onSelectShift,
}: WeekViewProps) {
  const hours: number[] = [];
  for (let h = HOURS_START; h <= HOURS_END; h++) hours.push(h);
  const totalHeight = (HOURS_END - HOURS_START) * WEEK_HOUR_PX;
  const yForMin = (m: number) => (m / 60 - HOURS_START) * WEEK_HOUR_PX;

  return (
    <div className="overflow-hidden rounded-[10px] border bg-card shadow-xs">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/50">
        <div />
        {weekDays.map((d) => {
          const isToday = isSameDay(d, today);
          const pref = getPreference(d.getDay());
          const cap = capacityFromPreference(pref);
          const dayShifts = getShiftsForDay(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDay(d)}
              className="border-l p-2.5 text-center transition-colors hover:bg-muted"
            >
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                {DOWS_SHORT[d.getDay()]}
              </div>
              {isToday ? (
                <div className="mx-auto mt-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-[15px] font-bold text-primary-foreground">
                  {d.getDate()}
                </div>
              ) : (
                <div className="mt-1 text-[18px] font-bold leading-none text-foreground">
                  {d.getDate()}
                </div>
              )}
              {cap > 0 ? (
                <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {dayShifts.length}/{cap} turnos
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-muted-foreground/70">Cerrado</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid body */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)]">
        {/* Hours column */}
        <div className="border-r">
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: WEEK_HOUR_PX }}
              className="flex items-start justify-end pr-2 pt-1 text-[11px] font-medium tabular-nums text-muted-foreground"
            >
              {pad(h)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((d) => {
          const pref = getPreference(d.getDay());
          const blocked = isDayBlocked(d);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const open = !!pref && (
            !!(pref.fromHourAM && pref.toHourAM) ||
            !!(pref.fromHourPM && pref.toHourPM)
          );
          const dayShifts = getShiftsForDay(d);

          const colTone = blocked
            ? "bg-[repeating-linear-gradient(-45deg,#fbe7e3_0_6px,#fcedea_6px_12px)]"
            : !open
              ? "bg-[repeating-linear-gradient(-45deg,#f1f5f6_0_6px,#f8fbfb_6px_12px)]"
              : isWeekend
                ? "bg-muted/40"
                : "";

          return (
            <div
              key={d.toISOString()}
              className={`relative border-l ${colTone}`}
              style={{
                height: totalHeight,
                backgroundImage:
                  open && !blocked
                    ? `repeating-linear-gradient(to bottom, transparent 0, transparent ${WEEK_HOUR_PX - 1}px, var(--border) ${WEEK_HOUR_PX - 1}px, var(--border) ${WEEK_HOUR_PX}px)`
                    : undefined,
              }}
            >
              {/* Hour droppable slots stacked invisibly for DnD */}
              {hours.slice(0, -1).map((h) => (
                <DroppableSlot
                  key={h}
                  id={`slot-${dateToYMD(d)}-${h}`}
                  onClick={() => !blocked && onSlotClick(d, h)}
                  className="absolute left-0 right-0 cursor-pointer transition-colors hover:bg-primary/[0.06]"
                  style={{ top: yForMin(h * 60), height: WEEK_HOUR_PX }}
                />
              ))}

              {/* Events */}
              {dayShifts.map((s) => {
                const startDate = new Date(s.start);
                const endDate = new Date(s.end);
                const startMin = toMinutes(startDate);
                const durationMin = Math.max(15, (endDate.getTime() - startDate.getTime()) / 60000);
                const top = yForMin(startMin);
                const height = (durationMin / 60) * WEEK_HOUR_PX - 2;
                const state = shiftToState(s);
                const tone = STATE_WEEK_CLASS[state];
                const selected = selectedShiftId === s.id;
                return (
                  <DraggableShift
                    key={s.id}
                    shift={s}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectShift(s);
                    }}
                    className={`absolute inset-x-[2px] overflow-hidden rounded-md border-l-[3px] bg-card px-1.5 py-0.5 text-[10.5px] leading-tight transition-transform hover:z-[3] hover:scale-[1.02] hover:shadow-sm ${tone} ${selected ? "ring-2 ring-primary" : ""}`}
                    style={{ top, height }}
                  >
                    <div className="tabular-nums text-muted-foreground/90">
                      {formatTime(startDate)}
                    </div>
                    <div className="truncate font-semibold text-foreground">
                      {s.patient
                        ? `${s.patient.lastName}, ${s.patient.firstName?.[0] ?? ""}.`
                        : "Turno"}
                    </div>
                  </DraggableShift>
                );
              })}

              {/* Now line — only for today's column */}
              {isSameDay(d, today) && (
                <NowLine yForMin={yForMin} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NowLine({ yForMin }: { yForMin: (m: number) => number }) {
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  if (min < HOURS_START * 60 || min > HOURS_END * 60) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[4] h-0 border-t-2 border-rose-700"
      style={{ top: yForMin(min) }}
    >
      <div className="absolute left-[-6px] top-[-6px] h-2.5 w-2.5 rounded-full bg-rose-700" />
    </div>
  );
}
