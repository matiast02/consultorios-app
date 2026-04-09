"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  UserX,
  Ban,
  Loader2,
  User,
  Clock,
  Calendar,
  Stethoscope,
} from "lucide-react";
import type { Shift, ShiftStatus } from "@/types";
import { SHIFT_STATUS_LABELS, SHIFT_STATUS_COLORS } from "@/types";

interface ShiftDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift;
  onUpdated: () => void;
}

export function ShiftDetailDialog({
  open,
  onOpenChange,
  shift,
  onUpdated,
}: ShiftDetailDialogProps) {
  const [observations, setObservations] = useState(shift.observations ?? "");
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState<ShiftStatus | null>(
    null
  );

  async function updateShift(updates: {
    status?: ShiftStatus;
    observations?: string;
  }) {
    try {
      setSaving(true);
      if (updates.status) setChangingStatus(updates.status);

      const res = await fetch(`/api/shifts/${shift.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al actualizar el turno");
      }

      toast.success("Turno actualizado");
      onUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar"
      );
    } finally {
      setSaving(false);
      setChangingStatus(null);
    }
  }

  const statusActions: {
    status: ShiftStatus;
    label: string;
    icon: React.ElementType;
    variant: "default" | "outline" | "destructive" | "secondary";
  }[] = [
    {
      status: "CONFIRMED",
      label: "Confirmar",
      icon: CheckCircle,
      variant: "default",
    },
    {
      status: "FINISHED",
      label: "Finalizar",
      icon: CheckCircle,
      variant: "secondary",
    },
    {
      status: "ABSENT",
      label: "Ausente",
      icon: UserX,
      variant: "destructive",
    },
    {
      status: "CANCELLED",
      label: "Cancelar",
      icon: Ban,
      variant: "outline",
    },
  ];

  // Filter out current status from actions
  const availableActions = statusActions.filter(
    (a) => a.status !== shift.status
  );

  const startDate = new Date(shift.start);
  const endDate = new Date(shift.end);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Detalle del Turno</DialogTitle>
          <DialogDescription>
            Información y acciones del turno.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Estado</span>
            <Badge
              variant="outline"
              className={SHIFT_STATUS_COLORS[shift.status]}
            >
              {SHIFT_STATUS_LABELS[shift.status]}
            </Badge>
          </div>

          <Separator />

          {/* Patient */}
          <div className="flex items-start gap-3">
            <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {shift.patient
                  ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                  : "Paciente no disponible"}
              </p>
              {shift.patient?.dni && (
                <p className="text-xs text-muted-foreground">
                  DNI: {shift.patient.dni}
                </p>
              )}
              {shift.patient?.telephone && (
                <p className="text-xs text-muted-foreground">
                  Tel: {shift.patient.telephone}
                </p>
              )}
            </div>
          </div>

          {/* Date & time */}
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {startDate.toLocaleDateString("es-AR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p className="text-sm">
              {startDate.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              -{" "}
              {endDate.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* Medic */}
          {shift.user && (
            <div className="flex items-start gap-3">
              <Stethoscope className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-sm">
                Dr/a.{" "}
                {shift.user.name ??
                  `${shift.user.firstName ?? ""} ${shift.user.lastName ?? ""}`.trim()}
              </p>
            </div>
          )}

          <Separator />

          {/* Observations */}
          <div className="space-y-2">
            <Label htmlFor="observations">Observaciones</Label>
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Agregar observaciones..."
              rows={3}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={saving || observations === (shift.observations ?? "")}
              onClick={() => updateShift({ observations })}
            >
              {saving && !changingStatus && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              Guardar observaciones
            </Button>
          </div>

          <Separator />

          {/* Status actions */}
          <div className="space-y-2">
            <Label>Cambiar estado</Label>
            <div className="flex flex-wrap gap-2">
              {availableActions.map((action) => (
                <Button
                  key={action.status}
                  variant={action.variant}
                  size="sm"
                  disabled={saving}
                  onClick={() => updateShift({ status: action.status })}
                >
                  {changingStatus === action.status ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <action.icon className="mr-2 h-3 w-3" />
                  )}
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
