"use client";

import { Calendar, Plus, Search, UserPlus } from "lucide-react";

interface QuickActionsCardProps {
  onNewShift: () => void;
  onNewPatient: () => void;
  onBlockDay: () => void;
  onSearchPatient: () => void;
}

export function QuickActionsCard({
  onNewShift,
  onNewPatient,
  onBlockDay,
  onSearchPatient,
}: QuickActionsCardProps) {
  const actions = [
    { label: "Nuevo turno",     icon: Plus,     onClick: onNewShift,     iconBg: "bg-primary/10 text-primary" },
    { label: "Nuevo paciente",  icon: UserPlus, onClick: onNewPatient,   iconBg: "bg-sky-50 text-sky-600 dark:bg-sky-950/40" },
    { label: "Bloquear día",    icon: Calendar, onClick: onBlockDay,     iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/40" },
    { label: "Buscar paciente", icon: Search,   onClick: onSearchPatient,iconBg: "bg-muted text-foreground/70" },
  ];

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        Acciones rápidas
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="flex flex-col items-start gap-2 rounded-xl border bg-card p-3 text-left transition hover:bg-muted/40"
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${a.iconBg}`}>
              <a.icon className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-semibold text-foreground">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
