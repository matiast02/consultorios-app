"use client";

import Link from "next/link";
import { FileText, Flag, Mail, Microscope } from "lucide-react";
import type { DashboardPendientes } from "@/types";

export function PendientesCard({ data }: { data: DashboardPendientes }) {
  const items: Array<{
    icon: typeof FileText;
    iconBg: string;
    iconColor: string;
    count: number;
    titleSingular: string;
    titlePlural: string;
    summary: string;
    href: string;
  }> = [
    {
      icon: FileText,
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600",
      count: data.evolucionesSinCerrar.count,
      titleSingular: "evolución sin cerrar",
      titlePlural: "evoluciones sin cerrar",
      summary: data.evolucionesSinCerrar.summary,
      href: "/dashboard/calendario",
    },
    {
      icon: Mail,
      iconBg: "bg-sky-50 dark:bg-sky-950/40",
      iconColor: "text-sky-600",
      count: data.recetasParaRenovar.count,
      titleSingular: "receta para renovar",
      titlePlural: "recetas para renovar",
      summary: data.recetasParaRenovar.summary,
      href: "/dashboard/pacientes",
    },
    {
      icon: Microscope,
      iconBg: "bg-rose-50 dark:bg-rose-950/40",
      iconColor: "text-rose-600",
      count: data.estudiosPendientes.count,
      titleSingular: "estudio pendiente",
      titlePlural: "estudios pendientes",
      summary: data.estudiosPendientes.summary,
      href: "/dashboard/pacientes",
    },
  ];

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Flag className="h-3.5 w-3.5 text-muted-foreground" />
          Pendientes
        </div>
        <Link href="/dashboard/pacientes" className="text-xs font-semibold text-primary hover:underline">
          Ver todo
        </Link>
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i}>
            <Link
              href={it.href}
              className="flex items-start gap-3 rounded-xl border p-3 transition hover:bg-muted/30"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.iconBg}`}>
                <it.icon className={`h-4 w-4 ${it.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {it.count} {it.count === 1 ? it.titleSingular : it.titlePlural}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{it.summary}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
