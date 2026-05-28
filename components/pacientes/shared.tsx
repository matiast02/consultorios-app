"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

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
export function fmtDateAR(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fmtDateLong(d: Date) {
  const s = d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.replace(/^./, (c) => c.toUpperCase());
}

export function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function relTime(d: Date, ref: Date = new Date()): string {
  const diff = Math.round((d.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  if (diff > 0 && diff < 7) return `en ${diff} días`;
  if (diff < 0 && diff > -7) return `hace ${-diff} días`;
  if (diff > 0 && diff < 30) return `en ${Math.round(diff / 7)} sem`;
  if (diff < 0 && diff > -30) return `hace ${Math.round(-diff / 7)} sem`;
  if (diff > 0) return `en ${Math.round(diff / 30)} meses`;
  return `hace ${Math.round(-diff / 30)} meses`;
}

export function calcAge(birth?: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
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
