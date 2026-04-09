"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Heart, AlertTriangle, Pill } from "lucide-react";
import type { ClinicalRecord } from "@/types";
import { format } from "date-fns";

export interface ClinicalRecordPanelProps {
  patientId: string;
}

export function ClinicalRecordPanel({ patientId }: ClinicalRecordPanelProps) {
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/patients/${patientId}/clinical-record`);
        if (res.ok) {
          const json = await res.json();
          setRecord(json.data ?? null);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData =
    record?.bloodType ||
    record?.allergies ||
    record?.currentMedication ||
    record?.personalHistory;
  const evolutions = record?.evolutions ?? [];

  return (
    <div className="space-y-3">
      {/* Quick info pills */}
      <div className="flex flex-wrap gap-2">
        {record?.bloodType && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Heart className="h-3 w-3 text-red-500" />
            {record.bloodType}
          </Badge>
        )}
        {record?.allergies && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-300 bg-amber-50 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          >
            <AlertTriangle className="h-3 w-3" />
            Alergias: {record.allergies.substring(0, 40)}
            {record.allergies.length > 40 ? "..." : ""}
          </Badge>
        )}
        {record?.currentMedication && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Pill className="h-3 w-3 text-blue-500" />
            Medicacion: {record.currentMedication.substring(0, 40)}
            {record.currentMedication.length > 40 ? "..." : ""}
          </Badge>
        )}
      </div>

      {/* Antecedentes */}
      {record?.personalHistory && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Antecedentes
          </p>
          <p className="mt-0.5 text-xs text-foreground/80">
            {record.personalHistory.substring(0, 120)}
            {record.personalHistory.length > 120 ? "..." : ""}
          </p>
        </div>
      )}

      {/* Last evolutions */}
      {evolutions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ultimas consultas
          </p>
          <div className="mt-1 space-y-1.5">
            {evolutions.slice(0, 3).map((evo) => (
              <div
                key={evo.id}
                className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {format(new Date(evo.createdAt), "dd/MM/yy")}
                  </span>
                  {evo.diagnosis && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {evo.diagnosis.substring(0, 30)}
                    </Badge>
                  )}
                </div>
                {evo.reason && (
                  <p className="mt-0.5 text-foreground/70">
                    {evo.reason.substring(0, 80)}
                    {evo.reason.length > 80 ? "..." : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasData && evolutions.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin historia clinica registrada
        </p>
      )}
    </div>
  );
}
