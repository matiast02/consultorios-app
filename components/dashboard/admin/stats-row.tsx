"use client";

import { Activity, ArrowDown, ArrowUp, CalendarCheck, ShieldAlert, UserX } from "lucide-react";
import type { AdminStats } from "@/types";

interface StatsRowProps {
  stats: AdminStats;
}

const MONTH_LABELS_ES: Record<string, string> = {
  "01": "enero",
  "02": "febrero",
  "03": "marzo",
  "04": "abril",
  "05": "mayo",
  "06": "junio",
  "07": "julio",
  "08": "agosto",
  "09": "septiembre",
  "10": "octubre",
  "11": "noviembre",
  "12": "diciembre",
};

function monthLabel(yyyymm: string): string {
  const part = yyyymm.split("-")[1] ?? "";
  const name = MONTH_LABELS_ES[part];
  if (!name) return yyyymm;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function DeltaChip({
  value,
  positiveIsGood,
  suffix = "%",
  unitLabel,
}: {
  value: number | null | undefined;
  positiveIsGood: boolean;
  suffix?: string;
  unitLabel: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const isZero = value === 0;
  // Color logic:
  // - positiveIsGood=true: up=green, down=red
  // - positiveIsGood=false: up=red, down=green
  let color = "bg-muted text-muted-foreground";
  if (!isZero) {
    const good = positiveIsGood ? isUp : isDown;
    color = good
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  }
  const absVal = Math.abs(value);
  const Arrow = isUp ? ArrowUp : isDown ? ArrowDown : null;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${color}`}>
      {Arrow && <Arrow className="h-2.5 w-2.5" strokeWidth={2.5} />}
      {absVal.toFixed(1).replace(/\.0$/, "")}
      {suffix}
      <span className="ml-0.5 font-normal opacity-80">{unitLabel}</span>
    </span>
  );
}

export function AdminStatsRow({ stats }: StatsRowProps) {
  const failedActive = stats.failedLogins24h.value > 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Turnos hoy */}
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40">
          <CalendarCheck className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {stats.todayShifts.value}
            </span>
            <DeltaChip
              value={stats.todayShifts.deltaPctVsYesterday}
              positiveIsGood
              unitLabel="vs ayer"
            />
          </div>
          <div className="text-[11.5px] text-muted-foreground">Turnos hoy</div>
        </div>
      </div>

      {/* 2. Ocupación hoy */}
      <div className="flex flex-col gap-2 rounded-2xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/40">
            <Activity className="h-4 w-4 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {stats.occupancyToday.pct.toFixed(0)}%
            </div>
            <div className="text-[11.5px] text-muted-foreground tabular-nums">
              {stats.occupancyToday.used}/{stats.occupancyToday.total} slots
            </div>
          </div>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{
              width: `${Math.max(0, Math.min(100, stats.occupancyToday.pct))}%`,
            }}
          />
        </div>
      </div>

      {/* 3. Logins fallidos 24h */}
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            failedActive ? "bg-amber-100 dark:bg-amber-950/40" : "bg-muted"
          }`}
        >
          <ShieldAlert
            className={`h-4 w-4 ${failedActive ? "text-amber-600" : "text-muted-foreground"}`}
          />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tabular-nums ${
                failedActive ? "text-amber-600" : "text-foreground"
              }`}
            >
              {stats.failedLogins24h.value}
            </span>
            <DeltaChip
              value={stats.failedLogins24h.deltaPctVs7dAvg}
              positiveIsGood={false}
              unitLabel="vs prom 7d"
            />
          </div>
          <div className="text-[11.5px] text-muted-foreground tabular-nums">
            Logins fallidos 24h · {stats.failedLogins24h.blockedCount} bloqueos
          </div>
        </div>
      </div>

      {/* 4. Tasa no-show mes */}
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/40">
          <UserX className="h-4 w-4 text-rose-600" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {stats.noShowRateMonth.pct.toFixed(1)}%
            </span>
            <DeltaChip
              value={stats.noShowRateMonth.deltaPctVsPrevMonth}
              positiveIsGood={false}
              suffix=" pts"
              unitLabel="vs mes ant."
            />
          </div>
          <div className="text-[11.5px] text-muted-foreground tabular-nums">
            No-show {monthLabel(stats.noShowRateMonth.month)} · {stats.noShowRateMonth.absent}/{stats.noShowRateMonth.total}
          </div>
        </div>
      </div>
    </div>
  );
}
