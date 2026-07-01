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

interface AgendaModeColumnsCompactProps {
  profesionales: AgendaProfessional[];
  onShiftClick?: (shiftId: string) => void;
}

/** Compact tabular view: one row per medic, columns are hours, cells show patient lastname chips. */
export function AgendaModeColumnsCompact({ profesionales, onShiftClick }: AgendaModeColumnsCompactProps) {
  const dayStart = HOURS[0];
  const dayEnd = HOURS[HOURS.length - 1] + 1;
  const span = dayEnd - dayStart;
  const nowH = getNowHour();
  const showNow = nowH >= dayStart && nowH <= dayEnd;
  const nowPct = ((nowH - dayStart) / span) * 100;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[920px]">
        {/* Header */}
        <div className="grid grid-cols-[200px_1fr] border-b bg-muted/30 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="px-3 py-2.5">Médico / Hora</div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}>
            {HOURS.map((h) => (
              <div key={h} className="px-1 py-2.5 text-left tabular-nums">
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
              className="grid grid-cols-[200px_1fr] items-center border-b last:border-b-0"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: p.dotColor ?? "#64748b" }}
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
              <div className="relative h-14">
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}>
                  {HOURS.map((h, i) => (
                    <div
                      key={h}
                      className={`border-l ${i === 0 ? "border-transparent" : "border-muted"} `}
                    />
                  ))}
                </div>
                {p.shifts.map((s) => {
                  const startH = getHourFromIso(s.start);
                  const endH = getHourFromIso(s.end);
                  if (endH <= dayStart || startH >= dayEnd) return null;
                  const left = ((Math.max(startH, dayStart) - dayStart) / span) * 100;
                  const width = ((Math.min(endH, dayEnd) - Math.max(startH, dayStart)) / span) * 100;
                  if (width <= 0) return null;
                  const lastName = (s.patientShortName.split(",")[0] ?? s.patientShortName).trim();
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => onShiftClick?.(s.id)}
                      title={`${formatHHmm24(s.start)} · ${s.patientShortName}`}
                      className={`absolute top-2 bottom-2 grid items-center rounded-md border border-white/30 px-1.5 text-[11px] font-medium shadow-sm transition hover:scale-[1.02] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/40 ${STATUS_BG[s.status]}`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                    >
                      <span className="truncate">{lastName}…</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Now indicator */}
          {showNow && (
            <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: `calc(200px + (${nowPct}% * ((100% - 200px) / 100%)))` }}>
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
