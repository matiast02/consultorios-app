"use client";

import { Badge } from "@/components/ui/badge";
import type { Shift, UserPreference } from "@/types";
import { DraggableShift, DroppableSlot } from "./dnd-helpers";
import {
  DAY_HOUR_PX,
  HOURS_START,
  HOURS_END,
  STATE_BADGE_CLASS,
  STATE_LABEL,
  STATE_TIMELINE_CLASS,
  capacityFromPreference,
  closedBands,
  dateToYMD,
  fmtDayLong,
  formatTime,
  freeSlots,
  isSameDay,
  pad,
  shiftToState,
  toMinutes,
} from "./calendar-helpers";

interface DayViewProps {
  date: Date;
  today: Date;
  preference: UserPreference | undefined;
  shifts: Shift[];
  isBlocked: boolean;
  selectedShiftId?: string | null;
  onSlotClick: (hour: number, minute?: number) => void;
  onSelectShift: (s: Shift) => void;
}

export function DayView({
  date,
  today,
  preference,
  shifts,
  isBlocked,
  selectedShiftId,
  onSlotClick,
  onSelectShift,
}: DayViewProps) {
  const hours: number[] = [];
  for (let h = HOURS_START; h <= HOURS_END; h++) hours.push(h);
  const yForMin = (m: number) => (m / 60 - HOURS_START) * DAY_HOUR_PX;
  const totalHeight = (HOURS_END - HOURS_START) * DAY_HOUR_PX;
  const isToday = isSameDay(date, today);

  const cap = capacityFromPreference(preference);
  const bands = isBlocked
    ? [[HOURS_START * 60, HOURS_END * 60] as [number, number]]
    : closedBands(preference, HOURS_START, HOURS_END);
  const slots = isBlocked ? [] : freeSlots(preference, shifts);

  // Build header description: "08:00–12:00 · 14:00–18:00" or "Sin atención"
  let openLabel = "Sin atención";
  if (preference) {
    const parts: string[] = [];
    if (preference.fromHourAM && preference.toHourAM)
      parts.push(`${preference.fromHourAM}–${preference.toHourAM}`);
    if (preference.fromHourPM && preference.toHourPM)
      parts.push(`${preference.fromHourPM}–${preference.toHourPM}`);
    if (parts.length) openLabel = parts.join(" · ");
  }

  return (
    <div className="overflow-hidden rounded-[10px] border bg-card shadow-xs">
      {/* Day head */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b bg-muted/40 px-5 py-3.5">
        <div className="text-base font-bold tracking-tight text-foreground first-letter:uppercase">
          {fmtDayLong(date)}
        </div>
        <div className="flex flex-wrap gap-5 text-[12.5px] text-muted-foreground">
          <span>
            <strong className="font-bold text-foreground">{shifts.length}</strong> turnos
          </span>
          <span>
            <strong className="font-bold text-foreground">{Math.max(0, cap - shifts.length)}</strong> huecos
          </span>
          <span>{openLabel}</span>
        </div>
      </div>

      <div className="relative grid grid-cols-[60px_1fr]">
        {/* Hour column */}
        <div className="border-r">
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: DAY_HOUR_PX }}
              className="flex items-start justify-end pr-2 pt-1 text-[11px] font-medium tabular-nums text-muted-foreground"
            >
              {pad(h)}:00
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div
          className="relative"
          style={{
            height: totalHeight,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${DAY_HOUR_PX - 1}px, var(--border) ${DAY_HOUR_PX - 1}px, var(--border) ${DAY_HOUR_PX}px)`,
          }}
        >
          {/* Half-hour dashed lines */}
          {hours.slice(0, -1).map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/60"
              style={{ top: yForMin(h * 60 + 30) }}
            />
          ))}

          {/* Closed bands (outside work hours / blocked day) */}
          {bands.map((b, i) => (
            <div
              key={`band-${i}`}
              className={`pointer-events-none absolute inset-x-0 ${
                isBlocked
                  ? "bg-[repeating-linear-gradient(-45deg,#fbe7e3_0_6px,#fcedea_6px_12px)]"
                  : "bg-[repeating-linear-gradient(-45deg,#f1f5f6_0_6px,#f8fbfb_6px_12px)]"
              }`}
              style={{ top: yForMin(b[0]), height: yForMin(b[1]) - yForMin(b[0]) }}
            />
          ))}

          {/* Hour droppable slots */}
          {hours.slice(0, -1).map((h) => (
            <DroppableSlot
              key={`slot-${h}`}
              id={`slot-${dateToYMD(date)}-${h}`}
              onClick={() => !isBlocked && onSlotClick(h)}
              className="absolute inset-x-0 cursor-pointer transition-colors hover:bg-primary/[0.05]"
              style={{ top: yForMin(h * 60), height: DAY_HOUR_PX }}
            />
          ))}

          {/* Free 30-min slot placeholders ("+ Libre") */}
          {slots.map((s) => (
            <button
              key={`free-${s.startMin}`}
              type="button"
              onClick={() => onSlotClick(Math.floor(s.startMin / 60), s.startMin % 60)}
              className="absolute left-2 right-3 grid place-items-center rounded-md border border-dashed border-border/80 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
              style={{
                top: yForMin(s.startMin),
                height: yForMin(s.endMin) - yForMin(s.startMin) - 2,
              }}
            >
              + Libre
            </button>
          ))}

          {/* Events */}
          {shifts.map((s) => {
            const startDate = new Date(s.start);
            const endDate = new Date(s.end);
            const startMin = toMinutes(startDate);
            const durationMin = Math.max(
              15,
              (endDate.getTime() - startDate.getTime()) / 60000
            );
            const top = yForMin(startMin);
            const height = (durationMin / 60) * DAY_HOUR_PX - 4;
            const state = shiftToState(s);
            const tone = STATE_TIMELINE_CLASS[state];
            const badgeTone = STATE_BADGE_CLASS[state];
            const selected = selectedShiftId === s.id;
            return (
              <DraggableShift
                key={s.id}
                shift={s}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectShift(s);
                }}
                className={`absolute left-2 right-3 flex flex-col gap-0.5 overflow-hidden rounded-lg border border-l-4 px-2.5 py-1.5 text-xs transition-all hover:z-[3] hover:-translate-y-px hover:shadow-sm ${tone} ${selected ? "ring-2 ring-primary" : ""}`}
                style={{ top, height }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatTime(startDate)}
                    </span>
                    <span className="ml-2 truncate text-[13px] font-bold text-foreground">
                      {s.patient
                        ? `${s.patient.lastName}, ${s.patient.firstName}`
                        : "Paciente"}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 border px-1.5 py-0 text-[10px] font-semibold ${badgeTone}`}
                  >
                    {STATE_LABEL[state]}
                  </Badge>
                </div>
                {s.consultationType && (
                  <div className="text-[11.5px] text-muted-foreground">
                    {s.consultationType.name}
                    {s.observations ? ` · ${s.observations}` : ""}
                  </div>
                )}
                <div className="flex gap-2 text-[11px] text-muted-foreground">
                  {s.patient?.os?.name && <span>{s.patient.os.name}</span>}
                  {s.patient?.os?.name && <span>·</span>}
                  <span>{Math.round(durationMin)} min</span>
                </div>
              </DraggableShift>
            );
          })}

          {/* Now line — only when viewing today */}
          {isToday && <NowLine yForMin={yForMin} />}
        </div>
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
      <span className="absolute right-2 top-[-10px] rounded bg-rose-700 px-1.5 py-px text-[10.5px] font-bold tabular-nums text-white">
        {pad(now.getHours())}:{pad(now.getMinutes())}
      </span>
    </div>
  );
}
