"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Users } from "lucide-react";
import { GenogramEditor } from "@/components/psychology/genogram-editor";
import {
  createEmptyGenogramData,
  type GenogramData,
} from "@/components/psychology/genogram-types";
import { SectionHead } from "./shared";

interface GenogramaTabProps {
  patientId: string;
  patientName?: string;
  /** JSON string stored on the clinical record, or null. */
  initialData: string | null;
  readOnly?: boolean;
  onSaved?: (genogramJson: string) => void;
}

function parseData(raw: string | null, patientName?: string): GenogramData {
  if (!raw) return createEmptyGenogramData(patientName);
  try {
    const parsed = JSON.parse(raw) as GenogramData;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.members)) return parsed;
  } catch {
    /* fall through */
  }
  return createEmptyGenogramData(patientName);
}

export function GenogramaTab({
  patientId,
  patientName,
  initialData,
  readOnly = false,
  onSaved,
}: GenogramaTabProps) {
  const [data, setData] = useState<GenogramData>(() => parseData(initialData, patientName));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleChange(next: GenogramData) {
    setData(next);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = JSON.stringify({ ...data, lastUpdated: new Date().toISOString() });
      const res = await fetch(`/api/patients/${patientId}/clinical-record`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genogram: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar");
      }
      toast.success("Genograma guardado");
      setDirty(false);
      onSaved?.(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
      <SectionHead
        icon={Users}
        title="Genograma familiar"
        description="Estructura familiar, relaciones y antecedentes"
        actions={
          !readOnly && (
            <Button size="sm" className="h-8" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Guardar
            </Button>
          )
        }
      />
      <div className="px-6 pt-4">
        <GenogramEditor value={data} onChange={handleChange} readOnly={readOnly} />
      </div>
    </Card>
  );
}
