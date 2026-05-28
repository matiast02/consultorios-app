"use client";

import type { AgendaProfessional } from "@/types";
import {
  HOURS,
  STATUS_BG,
  currentTimeLabel,
  formatHHmmShort,
  getHourFromIso,
  getNowHour,
} from "./agenda-shared";

interface AgendaModeColumnsDetailedProps {
  profesionales: AgendaProfessional[];
  onShiftClick?: (shiftId: string) => void;
}

/**
 * Detailed two-column-ish layout for ≤2 medics: a wide hour grid (08-18) on the left
 * and one column per medic that lays out each shift card with time + patient.
 */
export function AgendaModeColumnsDetailed({ profesionales, onShiftClick }: AgendaModeColumnsDetailedProps) {
  const dayStart = HOURS[0];
  const dayEnd = HOURS[HOURS.length - 1] + 1;
  const span = dayEnd - dayStart;
  const nowH = getNowHour();
  const showNow = nowH >= dayStart && nowH <= dayEnd;
  const nowOffsetPct = ((nowH - dayStart) / span) * 100;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Header row: time gutter + medic headers */}
        <div className="grid border-b" style={{ gridTemplateColumns: `64px repeat(${profesionales.length}, minmax(0, 1fr))` }}>
          <div />
          {profesionales.map((p) => (
            <div key={p.id} className="flex items-center gap-2 border-l px-3 py-3">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: p.dotColor ?? "#64748b" }}
              >
                {p.shortName.replace(/^Dr\.|^Dra\./, "").trim().slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{p.shortName}</div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {p.especialidad ?? "—"}
                  {p.room ? ` · Consultorio ${p.room.replace(/^C/i, "")}` : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `64px repeat(${profesionales.length}, minmax(0, 1fr))` }}
        >
          {/* Time gutter */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex h-16 items-start justify-end pr-2 pt-1 text-[11px] font-medium tabular-nums text-muted-foreground"
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Medic columns */}
          {profesionales.map((p) => (
            <div key={p.id} className="relative border-l">
              {/* Hour lines */}
              {HOURS.map((h) => (
                <div key={h} className="h-16 border-b border-dashed border-muted/70" />
              ))}
              {/* Shift blocks */}
              {p.shifts.map((s) => {
                const startH = getHourFromIso(s.start);
                const endH = getHourFromIso(s.end);
                if (endH <= dayStart || startH >= dayEnd) return null;
                const top = (Math.max(startH, dayStart) - dayStart) * 64; // 64px per hour
                const height = (Math.min(endH, dayEnd) - Math.max(startH, dayStart)) * 64;
                const lastName = (s.patientShortName.split(",")[0] ?? s.patientShortName).trim();
                const initial = (s.patientShortName.split(",")[1] ?? "").trim();
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => onShiftClick?.(s.id)}
                    title={`${formatHHmmShort(s.start)} · ${s.patientShortName}`}
                    className={`absolute left-1 right-1 flex flex-col items-start justify-start gap-0.5 rounded-md border border-white/40 px-2 py-1 text-left text-[11px] font-medium leading-tight shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/40 ${STATUS_BG[s.status]}`}
                    style={{ top, height: Math.max(height - 2, 22) }}
                  >
                    <span className="tabular-nums">{formatHHmmShort(s.start)}</span>
                    <span className="truncate font-semibold">
                      {lastName}{initial ? `, ${initial}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* Now line spanning medic columns */}
          {showNow && (
            <div
              className="pointer-events-none absolute"
              style={{ left: 64, right: 0, top: `${nowOffsetPct}%` }}
            >
              <div className="relative h-0.5 bg-rose-500/80">
                <div className="absolute -left-12 -top-2.5 rounded-md bg-rose-500 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white shadow">
                  {currentTimeLabel()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
