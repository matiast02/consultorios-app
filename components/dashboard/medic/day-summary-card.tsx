"use client";

import { CalendarCheck, CheckCircle2, Clock, XCircle, Info } from "lucide-react";
import type { DashboardTodayStats } from "@/types";

interface DaySummaryCardProps {
  stats: DashboardTodayStats;
}

export function DaySummaryCard({ stats }: DaySummaryCardProps) {
  const handled = stats.atendidos + stats.ausentes;
  const progress = stats.total > 0 ? Math.round((stats.atendidos / stats.total) * 100) : 0;
  const absentRatio = stats.total > 0 ? (stats.ausentes / stats.total) * 100 : 0;
  const items = [
    { label: "Atendidos",  value: stats.atendidos,  icon: CheckCircle2, accent: "text-emerald-600",
      bg: "bg-emerald-50", iconBg: "bg-emerald-100/80" },
    { label: "Por venir",  value: stats.porVenir,   icon: Clock,        accent: "text-amber-600",
      bg: "bg-amber-50",   iconBg: "bg-amber-100/80" },
    { label: "Confirmados", value: stats.confirmados, icon: CalendarCheck, accent: "text-sky-600",
      bg: "bg-sky-50",     iconBg: "bg-sky-100/80" },
    { label: "Ausentes",   value: stats.ausentes,   icon: XCircle,      accent: "text-rose-600",
      bg: "bg-rose-50",    iconBg: "bg-rose-100/80" },
  ];

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Resumen del día</h3>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {handled}/{stats.total}
        </span>
      </div>

      {/* Progress bar (atendidos vs total, with absent slice in red) */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="flex h-full">
          <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
          <div className="h-full bg-rose-500" style={{ width: `${absentRatio}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {items.map((it) => (
          <div
            key={it.label}
            className={`flex items-center gap-2.5 rounded-xl border border-transparent ${it.bg} px-3 py-2.5 dark:bg-muted/40`}
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${it.iconBg} dark:bg-muted`}>
              <it.icon className={`h-3.5 w-3.5 ${it.accent}`} />
            </div>
            <div className="leading-tight">
              <div className="text-xl font-bold tabular-nums text-foreground">{it.value}</div>
              <div className="text-[11px] text-muted-foreground">{it.label}</div>
            </div>
          </div>
        ))}
      </div>

      {stats.ausentes > 0 && (
        <div className="mt-3 flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {stats.ausentes} {stats.ausentes === 1 ? "paciente no asistió" : "pacientes no asistieron"} — revisá si reagendás
          </p>
        </div>
      )}
    </div>
  );
}
