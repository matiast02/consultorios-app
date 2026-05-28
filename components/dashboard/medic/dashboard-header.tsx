"use client";

import { Plus, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DashboardHeaderProps {
  doctorName: string;
  onNewShift: () => void;
  onNewPatient: () => void;
}

function getGreeting(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function DashboardHeader({ doctorName, onNewShift, onNewPatient }: DashboardHeaderProps) {
  const now = new Date();
  const greeting = getGreeting(now.getHours());
  const dateLong = capitalize(format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }))
    .replace(/De/g, "de");
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-foreground">
          {greeting}, <span className="text-foreground/70">{doctorName}</span>
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{dateLong}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNewShift}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          Nuevo turno
        </button>
        <button
          type="button"
          onClick={onNewPatient}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo paciente
        </button>
      </div>
    </div>
  );
}
