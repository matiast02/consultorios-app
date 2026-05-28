"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import type { DashboardWeekData } from "@/types";

export function WeekCard({ data }: { data: DashboardWeekData }) {
  const maxCount = Math.max(1, ...data.byDay.map((d) => d.count));
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          Semana
        </div>
        <Link
          href="/dashboard/estadisticas"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver mes
        </Link>
      </div>

      <div className="mt-3">
        <p className="text-2xl font-bold tabular-nums text-foreground">{data.totalShifts}</p>
        <p className="text-xs text-muted-foreground">turnos esta semana</p>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {data.byDay.map((d) => {
          const empty = d.count === 0;
          const heightPct = empty ? 8 : Math.max(18, Math.round((d.count / maxCount) * 100));
          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <div
                className={`text-[10px] font-bold uppercase tracking-wide ${d.isToday ? "text-primary" : "text-muted-foreground/80"}`}
              >
                {d.dayLabel}
              </div>
              <div
                className={`text-[10.5px] font-semibold tabular-nums ${d.isToday ? "text-primary" : "text-foreground/70"}`}
              >
                {d.dayNumber}
              </div>
              <div className="flex h-12 w-full items-end overflow-hidden rounded-md bg-muted/40">
                {empty ? (
                  <div className="w-full text-center text-[10px] text-muted-foreground/60">—</div>
                ) : (
                  <div
                    className={`w-full rounded-md ${d.isToday ? "bg-primary" : "bg-primary/60"}`}
                    style={{ height: `${heightPct}%` }}
                  />
                )}
              </div>
              <div
                className={`text-[10.5px] font-bold tabular-nums ${empty ? "text-muted-foreground/40" : "text-foreground"}`}
              >
                {empty ? "—" : d.count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
