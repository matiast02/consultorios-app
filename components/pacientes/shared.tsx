"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { calcAge, formatDateAR, formatDateLong, formatTime } from "@/lib/format";
// Alias históricos: la implementación vive en lib/format.ts.
export { calcAge };
export const fmtDateAR = formatDateAR;
export const fmtDateLong = formatDateLong;
export const fmtTime = formatTime;

/* ─── Section heading shared by cards (matches design's .card-head) ─────── */
export function SectionHead({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string | React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold leading-tight tracking-tight">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ─── Mini key label (UPPERCASE tracked) ────────────────────────────────── */
export function MetaLabel({
  icon: Icon,
  children,
  className,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/* ─── Data-card field cell (used in Datos personales grid) ──────────────── */
export function DataCell({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon?: LucideIcon;
  label: string;
  value?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-16 flex-col gap-0.5 bg-card p-3">
      <MetaLabel icon={Icon}>{label}</MetaLabel>
      <span className="text-[13.5px] font-semibold text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </span>
      {sub && (
        <span className="text-xs font-medium text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}

/* ─── Time helpers ──────────────────────────────────────────────────────── */



/**
 * Distancia en palabras respecto a `ref`: "hoy", "ayer", "hace 3 días",
 * "hace 2 sem", "hace 1 mes", "hace 2 años", "en 5 días", "mañana".
 */
export function relTime(d: Date, ref: Date = new Date()): string {
  const diff = Math.round((d.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  const abs = Math.abs(diff);
  const amount =
    abs < 7
      ? plural(abs, "día", "días")
      : abs < 30
        ? plural(Math.round(abs / 7), "sem", "sem")
        : abs < 345
          ? plural(Math.round(abs / 30), "mes", "meses")
          : plural(Math.round(abs / 365), "año", "años");
  return diff > 0 ? `en ${amount}` : `hace ${amount}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}


export function safeParseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed as T;
  } catch {
    return fallback;
  }
}
