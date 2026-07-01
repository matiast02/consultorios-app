"use client";

const OS_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  OSDE:           { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  "Swiss Medical":{ dot: "bg-rose-500",    text: "text-rose-700",    bg: "bg-rose-50" },
  Galeno:         { dot: "bg-sky-500",     text: "text-sky-700",     bg: "bg-sky-50" },
  Medifé:         { dot: "bg-violet-500",  text: "text-violet-700",  bg: "bg-violet-50" },
  IOMA:           { dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50" },
  PAMI:           { dot: "bg-rose-600",    text: "text-rose-700",    bg: "bg-rose-50" },
  Particular:     { dot: "bg-slate-500",   text: "text-slate-700",   bg: "bg-slate-100" },
  "Unión Personal": { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50" },
};

const SHORT_NAMES: Record<string, string> = {
  "Swiss Medical": "SWISS",
  "Unión Personal": "UNIÓN",
  Particular: "PART",
  Medifé: "MEDIFE",
};

export function OsBadge({ name }: { name: string }) {
  const palette = OS_COLORS[name] ?? { dot: "bg-slate-400", text: "text-slate-700", bg: "bg-slate-100" };
  const label = SHORT_NAMES[name] ?? name.toUpperCase();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide ${palette.bg} ${palette.text} dark:bg-muted/40 dark:text-foreground`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} />
      {label}
    </span>
  );
}
