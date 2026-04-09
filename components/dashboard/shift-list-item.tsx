"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ClinicalRecordPanel } from "@/components/dashboard/clinical-record-panel";
import {
  ChevronDown,
  CheckCircle,
  UserX,
  Play,
  Pencil,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import type { Shift, ShiftStatus } from "@/types";
import { SHIFT_STATUS_LABELS, SHIFT_STATUS_COLORS } from "@/types";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ShiftListItemProps {
  shift: Shift;
  isExpanded: boolean;
  isUpdating: boolean;
  isEditingObs: boolean;
  editingObsText: string;
  savingObs: boolean;
  onToggleExpand: (shiftId: string) => void;
  onChangeStatus: (shiftId: string, status: ShiftStatus) => void;
  onAttend: (shift: Shift) => void;
  onStartEditObs: (shiftId: string, currentText: string) => void;
  onCancelEditObs: () => void;
  onSaveObs: (shiftId: string) => void;
  onObsTextChange: (text: string) => void;
}

export function ShiftListItem({
  shift,
  isExpanded,
  isUpdating,
  isEditingObs,
  editingObsText,
  savingObs,
  onToggleExpand,
  onChangeStatus,
  onAttend,
  onStartEditObs,
  onCancelEditObs,
  onSaveObs,
  onObsTextChange,
}: ShiftListItemProps) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  const isDone =
    shift.status === "FINISHED" ||
    shift.status === "ABSENT" ||
    shift.status === "CANCELLED";

  return (
    <div
      className={`rounded-lg border transition-all ${
        shift.status === "CONFIRMED"
          ? "border-primary/30 bg-primary/5 shadow-sm"
          : isDone
            ? "border-border bg-muted/30"
            : "border-border bg-card"
      }`}
    >
      {/* Main row */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* Expand toggle */}
          <button
            onClick={() => shift.patient && onToggleExpand(shift.id)}
            className="flex items-center gap-4 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                isExpanded ? "rotate-0" : "-rotate-90"
              }`}
            />
            <div className="text-center">
              <p className="text-lg font-bold leading-none">
                {formatTime(start)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {formatTime(end)}
              </p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div>
              <p className="font-medium">
                {shift.patient
                  ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                  : "Paciente"}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                {shift.patient?.dni && (
                  <span className="text-xs text-muted-foreground">
                    DNI: {shift.patient.dni}
                  </span>
                )}
                {shift.patient?.os && (
                  <span className="text-xs text-muted-foreground">
                    — {shift.patient.os.name}
                  </span>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:shrink-0">
          {shift.isOverbook && (
            <Badge
              variant="outline"
              className="border-amber-500 text-[10px] text-amber-600"
            >
              ST
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-xs ${SHIFT_STATUS_COLORS[shift.status]}`}
          >
            {SHIFT_STATUS_LABELS[shift.status]}
          </Badge>

          {shift.status === "PENDING" && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isUpdating}
                onClick={() => onChangeStatus(shift.id, "CONFIRMED")}
              >
                {isUpdating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                )}
                Confirmar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                disabled={isUpdating}
                onClick={() => onChangeStatus(shift.id, "ABSENT")}
              >
                <UserX className="mr-1.5 h-3.5 w-3.5" />
                Ausente
              </Button>
            </>
          )}

          {shift.status === "CONFIRMED" && (
            <>
              <Button
                size="sm"
                disabled={isUpdating}
                onClick={() => onAttend(shift)}
              >
                {isUpdating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                Atender
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                disabled={isUpdating}
                onClick={() => onChangeStatus(shift.id, "ABSENT")}
              >
                <UserX className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {shift.status === "FINISHED" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() =>
                onStartEditObs(shift.id, shift.observations ?? "")
              }
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Editar obs.
            </Button>
          )}

          {shift.status === "ABSENT" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              disabled={isUpdating}
              onClick={() => onChangeStatus(shift.id, "CONFIRMED")}
            >
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Revertir
            </Button>
          )}

          {shift.patient && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-primary"
            >
              <Link
                href={`/dashboard/pacientes/${shift.patientId}/historia-clinica`}
                target="_blank"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                HC
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Inline edit observations */}
      {isEditingObs && (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Editar observaciones
          </p>
          <Textarea
            value={editingObsText}
            onChange={(e) => onObsTextChange(e.target.value)}
            rows={3}
            className="mb-2 resize-y text-sm"
            placeholder="Observaciones de la consulta..."
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onSaveObs(shift.id)}
              disabled={savingObs}
            >
              {savingObs && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEditObs}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Observations preview (when not editing) */}
      {shift.status === "FINISHED" && shift.observations && !isEditingObs && (
        <div className="border-t px-4 py-2">
          <p className="text-xs italic text-muted-foreground">
            {shift.observations}
          </p>
        </div>
      )}

      {/* Expanded clinical record panel */}
      {isExpanded && shift.patient && (
        <div className="border-t bg-muted/20 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-primary">
              <FileText className="mr-1 inline h-3.5 w-3.5" />
              Historia Clinica — {shift.patient.firstName}{" "}
              {shift.patient.lastName}
            </p>
            <Button
              asChild
              size="sm"
              variant="link"
              className="h-auto p-0 text-xs"
            >
              <Link
                href={`/dashboard/pacientes/${shift.patientId}/historia-clinica`}
                target="_blank"
              >
                Ver completa
                <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
          <ClinicalRecordPanel patientId={shift.patientId} />
        </div>
      )}
    </div>
  );
}
