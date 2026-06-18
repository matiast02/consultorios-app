"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Stethoscope } from "lucide-react";
import { OdontogramEditor } from "@/components/dental/odontogram-editor";
import {
  createEmptyOdontogram,
  type OdontogramData,
} from "@/components/dental/odontogram-types";
import { SectionHead } from "./shared";

interface OdontogramaTabProps {
  patientId: string;
  /** JSON string stored on the clinical record, or null. */
  initialData: string | null;
  readOnly?: boolean;
  onSaved?: (odontogramJson: string) => void;
}

function parseData(raw: string | null): OdontogramData {
  if (!raw) return createEmptyOdontogram();
  try {
    const parsed = JSON.parse(raw) as OdontogramData;
    if (parsed && typeof parsed === "object" && parsed.teeth) return parsed;
  } catch {
    /* fall through */
  }
  return createEmptyOdontogram();
}

export function OdontogramaTab({
  patientId,
  initialData,
  readOnly = false,
  onSaved,
}: OdontogramaTabProps) {
  const [data, setData] = useState<OdontogramData>(() => parseData(initialData));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleChange(next: OdontogramData) {
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
        body: JSON.stringify({ odontogram: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar");
      }
      toast.success("Odontograma guardado");
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
        icon={Stethoscope}
        title="Odontograma"
        description="Estado dental por pieza y cara (sistema FDI)"
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
        <OdontogramEditor value={data} onChange={handleChange} readOnly={readOnly} />
      </div>
    </Card>
  );
}
