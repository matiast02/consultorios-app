"use client";

import { useEffect, useState } from "react";
import { Plus, UserPlus } from "lucide-react";

interface SecretaryDashboardHeaderProps {
  secretaryName: string;
  activeProfessionalsCount: number;
  onNewShift: () => void;
  onRegisterArrival: () => void;
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const WEEKDAYS_ES = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateSpanish(d: Date): string {
  const dow = WEEKDAYS_ES[d.getDay()];
  const day = d.getDate();
  const month = MONTHS_ES[d.getMonth()];
  const year = d.getFullYear();
  return `${dow}, ${day} De ${titleCase(month)} De ${year}`;
}

function formatTimeAmPm(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p. m." : "a. m.";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function SecretaryDashboardHeader({
  secretaryName,
  activeProfessionalsCount,
  onNewShift,
  onRegisterArrival,
}: SecretaryDashboardHeaderProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Recepción <span className="text-muted-foreground">· {secretaryName}</span>
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span>{formatDateSpanish(now)}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {formatTimeAmPm(now)} · En Vivo
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span>{activeProfessionalsCount} Profesionales Activos</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onNewShift}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          Nuevo turno
        </button>
        <button
          type="button"
          onClick={onRegisterArrival}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0d4f4d] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d]"
        >
          <UserPlus className="h-4 w-4" />
          Registrar llegada
        </button>
      </div>
    </div>
  );
}
