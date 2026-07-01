"use client";

import type { AgendaProfessional } from "@/types";
import {
  HOURS,
  STATUS_BG,
  currentTimeLabel,
  formatHHmm24,
  getHourFromIso,
  getNowHour,
} from "./agenda-shared";

interface AgendaModeRailsProps {
  profesionales: AgendaProfessional[];
  onShiftClick?: (shiftId: string) => void;
}

export function AgendaModeRails({ profesionales, onShiftClick }: AgendaModeRailsProps) {
  const dayStart = 8;
  const dayEnd = 18;
  const span = dayEnd - dayStart;
  const nowH = getNowHour();
  const showNow = nowH >= dayStart && nowH <= dayEnd;
  const nowPct = ((nowH - dayStart) / span) * 100;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[920px]">
        {/* Header */}
        <div className="grid grid-cols-[170px_1fr] border-b text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="px-3 py-2">Profesional</div>
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${span + 1}, minmax(0, 1fr))` }}>
            {HOURS.map((h) => (
              <div key={h} className="px-1 py-2 text-left tabular-nums">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {profesionales.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[170px_1fr] items-center border-b last:border-b-0"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: p.dotColor ?? "#64748b" }}
                  title={p.shortName}
                >
                  {p.shortName.replace(/^Dr\.|^Dra\./, "").trim().slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium text-foreground">{p.shortName}</div>
                  {p.especialidad && (
                    <div className="truncate text-[10.5px] text-muted-foreground">{p.especialidad}</div>
                  )}
                </div>
              </div>

              {/* Lane */}
              <div className="relative h-10">
                {/* Hour grid lines */}
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${span + 1}, minmax(0, 1fr))` }}>
                  {HOURS.map((h, i) => (
                    <div
                      key={h}
                      className={`border-l ${i === 0 ? "border-transparent" : "border-muted"} `}
                    />
                  ))}
                </div>
                {/* Shift blocks */}
                {p.shifts.map((s) => {
                  const startH = getHourFromIso(s.start);
                  const endH = getHourFromIso(s.end);
                  if (endH <= dayStart || startH >= dayEnd) return null;
                  const left = ((Math.max(startH, dayStart) - dayStart) / span) * 100;
                  const width = ((Math.min(endH, dayEnd) - Math.max(startH, dayStart)) / span) * 100;
                  if (width <= 0) return null;
                  const initial = (s.patientShortName.split(",")[0] ?? "?").trim().slice(0, 1).toUpperCase();
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => onShiftClick?.(s.id)}
                      title={`${formatHHmm24(s.start)} · ${s.patientShortName}`}
                      className={`absolute top-1.5 bottom-1.5 grid place-items-center rounded-md border border-white/40 px-1 text-[10.5px] font-semibold shadow-sm transition hover:scale-[1.02] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/40 ${STATUS_BG[s.status]}`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 1.2)}%` }}
                    >
                      <span className="truncate">{initial}…</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Now line */}
          {showNow && (
            <div
              className="pointer-events-none absolute top-0 bottom-0"
              style={{ left: `calc(170px + (${nowPct}% * ((100% - 170px) / 100%)))` }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-px bg-rose-500/80" />
              <div className="absolute -top-2 -translate-x-1/2 rounded-md bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
                {currentTimeLabel()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
