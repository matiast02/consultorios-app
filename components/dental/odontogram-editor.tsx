"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Odontogram } from "./odontogram";
import type { OdontogramData, FaceStatus } from "./odontogram-types";
import {
  FACE_STATUS_COLORS,
  FACE_STATUS_LABELS,
  TOOTH_STATUS_COLORS,
  TOOTH_STATUS_LABELS,
  calculateCPOD,
  createEmptyOdontogram,
} from "./odontogram-types";

interface OdontogramEditorProps {
  value: OdontogramData;
  onChange: (data: OdontogramData) => void;
  readOnly?: boolean;
}

type ToolType = FaceStatus | "missing" | "implant";

const TOOL_OPTIONS: {
  value: ToolType;
  label: string;
  color: string;
  description: string;
}[] = [
  { value: "caries", label: "Caries", color: FACE_STATUS_COLORS.caries, description: "Marcar caries en cara" },
  { value: "restoration", label: "Restauracion", color: FACE_STATUS_COLORS.restoration, description: "Restauracion/obturacion" },
  { value: "crown", label: "Corona", color: FACE_STATUS_COLORS.crown, description: "Corona protesica" },
  { value: "endodontics", label: "Endodoncia", color: FACE_STATUS_COLORS.endodontics, description: "Tratamiento de conducto" },
  { value: "fracture", label: "Fractura", color: FACE_STATUS_COLORS.fracture, description: "Pieza fracturada" },
  { value: "healthy", label: "Borrar", color: "transparent", description: "Limpiar cara (sano)" },
];

export function OdontogramEditor({
  value,
  onChange,
  readOnly = false,
}: OdontogramEditorProps) {
  const [activeTool, setActiveTool] = useState<ToolType>("caries");
  const cpod = calculateCPOD(value);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!readOnly && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Herramienta activa — Click en una cara del diente para aplicar
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {TOOL_OPTIONS.map((tool) => (
              <Button
                key={tool.value}
                type="button"
                variant={activeTool === tool.value ? "default" : "outline"}
                size="sm"
                className={`h-7 text-xs gap-1.5 ${
                  activeTool === tool.value
                    ? ""
                    : "hover:bg-accent"
                }`}
                onClick={() => setActiveTool(tool.value)}
              >
                <div
                  className="h-2.5 w-2.5 rounded-sm border shrink-0"
                  style={{
                    backgroundColor: tool.color,
                    borderColor: tool.color === "transparent" ? "currentColor" : tool.color,
                  }}
                />
                {tool.label}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Doble click o click derecho en un diente para marcar como ausente/implante
          </p>
        </div>
      )}

      <Separator />

      {/* Odontogram SVG */}
      <Odontogram
        data={value}
        onChange={onChange}
        activeTool={activeTool}
        readOnly={readOnly}
      />

      <Separator />

      {/* CPOD Index + Legend */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* CPOD */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Indice CPOD</Label>
          <div className="flex gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{cpod.C}</div>
              <div className="text-[10px] text-muted-foreground">Cariados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-500">{cpod.P}</div>
              <div className="text-[10px] text-muted-foreground">Perdidos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{cpod.O}</div>
              <div className="text-[10px] text-muted-foreground">Obturados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{cpod.total}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Leyenda</Label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(FACE_STATUS_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-sm border"
                  style={{
                    backgroundColor: FACE_STATUS_COLORS[key as FaceStatus],
                    borderColor:
                      key === "healthy"
                        ? "currentColor"
                        : FACE_STATUS_COLORS[key as FaceStatus],
                  }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-gray-500 opacity-40" />
              <span className="text-[10px] text-muted-foreground">
                Ausente (X)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full border-2"
                style={{ borderColor: TOOTH_STATUS_COLORS.implant }}
              />
              <span className="text-[10px] text-muted-foreground">
                Implante
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="odontogram-notes" className="text-xs">
          Observaciones del odontograma
        </Label>
        <Textarea
          id="odontogram-notes"
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="Notas generales sobre el estado dental..."
          rows={2}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
