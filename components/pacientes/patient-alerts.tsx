"use client";

import { AlertTriangle, Pill } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StructuredAllergy } from "@/types";

interface PatientAlertsProps {
  severeAllergies: StructuredAllergy[];
  chronicMedications: string[]; // array of medication names
}

export function PatientAlerts({
  severeAllergies,
  chronicMedications,
}: PatientAlertsProps) {
  if (severeAllergies.length === 0 && chronicMedications.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {severeAllergies.map((a, i) => (
        <div
          key={`a-${i}`}
          className="flex items-start gap-3 rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
        >
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-rose-200 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="mr-1.5 font-bold">Alergia grave:</span>
            <strong className="font-bold">{a.nombre}</strong>
            {a.nota && <span className="opacity-90"> — {a.nota}</span>}
          </div>
          <Badge
            className="ml-auto shrink-0 border-rose-300 bg-rose-200/70 text-rose-900 hover:bg-rose-200/70 dark:border-rose-800/60 dark:bg-rose-900/40 dark:text-rose-200"
          >
            Severidad alta
          </Badge>
        </div>
      ))}

      {chronicMedications.length > 0 && (
        <div className="flex items-start gap-3 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
            <Pill className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="mr-1.5 font-bold">Medicación crónica:</span>
            {chronicMedications.join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}
