"use client";

import { Calendar, Clock, Stethoscope, Users } from "lucide-react";
import type { SecretaryStatsData } from "@/types";

interface StatsRowProps {
  stats: SecretaryStatsData;
}

export function SecretaryStatsRow({ stats }: StatsRowProps) {
  const items: Array<{
    label: string;
    value: number;
    Icon: typeof Users;
    iconBg: string;
    iconColor: string;
    valueColor?: string;
  }> = [
    {
      label: "En sala de espera",
      value: stats.enSalaDeEspera,
      Icon: Users,
      iconBg: "bg-sky-100 dark:bg-sky-950/40",
      iconColor: "text-sky-600",
    },
    {
      label: "En consulta",
      value: stats.enConsulta,
      Icon: Stethoscope,
      iconBg: "bg-cyan-100 dark:bg-cyan-950/40",
      iconColor: "text-cyan-600",
    },
    {
      label: "Esperando hace > 15 min",
      value: stats.esperandoMas15,
      Icon: Clock,
      iconBg: stats.esperandoMas15 > 0 ? "bg-amber-100 dark:bg-amber-950/40" : "bg-muted",
      iconColor: stats.esperandoMas15 > 0 ? "text-amber-600" : "text-muted-foreground",
      valueColor: stats.esperandoMas15 > 0 ? "text-amber-600" : undefined,
    },
    {
      label: "Huecos libres hoy",
      value: stats.huecosHoy,
      Icon: Calendar,
      iconBg: "bg-emerald-100 dark:bg-emerald-950/40",
      iconColor: "text-emerald-600",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${it.iconBg}`}
          >
            <it.Icon className={`h-4 w-4 ${it.iconColor}`} />
          </div>
          <div className="leading-tight">
            <div
              className={`text-2xl font-bold tabular-nums ${it.valueColor ?? "text-foreground"}`}
            >
              {it.value}
            </div>
            <div className="text-[11.5px] text-muted-foreground">{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
