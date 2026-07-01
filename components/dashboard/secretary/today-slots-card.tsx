"use client";

import { Calendar } from "lucide-react";
import type { MedicSlotsGroup } from "@/types";

interface TodaySlotsCardProps {
  groups: MedicSlotsGroup[];
  onViewWeek: () => void;
  onPickSlot?: (medicId: string, time: string, durationMinutes: number) => void;
}

export function TodaySlotsCard({ groups, onViewWeek, onPickSlot }: TodaySlotsCardProps) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Huecos disponibles · hoy
        </div>
        <button
          type="button"
          onClick={onViewWeek}
          className="text-[13px] font-medium text-[#0d4f4d] transition hover:text-[#0a3f3d]"
        >
          Ver semana
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No quedan huecos disponibles hoy.
        </div>
      ) : (
        <ul className="divide-y">
          {groups.map((g) => (
            <li key={g.medicId} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  {g.dotColor && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: g.dotColor }}
                    />
                  )}
                  {g.medicShortName}
                </div>
                <span className="text-[11.5px] text-muted-foreground">
                  {g.count === 1 ? "1 hueco" : `${g.count} huecos`}
                </span>
              </div>
              {g.slots.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {g.slots.map((s) => (
                    <button
                      key={`${g.medicId}-${s.time}`}
                      type="button"
                      onClick={() => onPickSlot?.(g.medicId, s.time, s.durationMinutes)}
                      title={`Reservar ${s.time} (${s.durationMinutes} min) con ${g.medicShortName}`}
                      className="inline-flex items-center gap-1 rounded-md border border-transparent bg-muted px-2 py-0.5 text-[11.5px] font-medium text-foreground transition hover:border-[#0d4f4d]/40 hover:bg-[#0d4f4d]/10 hover:text-[#0d4f4d] focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/30"
                    >
                      <span className="tabular-nums">{s.time}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{s.durationMinutes}m</span>
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
