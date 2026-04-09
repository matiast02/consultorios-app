"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, CalendarPlus, Pill } from "lucide-react";
import type { Shift, ModuleConfig } from "@/types";

interface QuickAttendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift;
  onSaved: () => void;
  onScheduleNext?: (patientId: string, medicId: string) => void;
  onCreatePrescription?: (patientId: string, shiftId: string) => void;
}

export function QuickAttendDialog({
  open,
  onOpenChange,
  shift,
  onSaved,
  onScheduleNext,
  onCreatePrescription,
}: QuickAttendDialogProps) {
  const [observations, setObservations] = useState(shift.observations ?? "");
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [prescriptionsEnabled, setPrescriptionsEnabled] = useState(false);

  const checkModules = useCallback(async () => {
    try {
      const res = await fetch("/api/modules");
      if (res.ok) {
        const json = await res.json();
        const modules: ModuleConfig[] = json.data ?? [];
        const prescMod = modules.find((m) => m.module === "prescriptions");
        setPrescriptionsEnabled(prescMod?.enabled ?? false);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (open) {
      checkModules();
    }
  }, [open, checkModules]);

  async function handleFinish() {
    try {
      setSaving(true);
      const res = await fetch(`/api/shifts/${shift.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "FINISHED",
          observations: observations || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al finalizar turno");
      }
      toast.success("Turno finalizado");
      setFinished(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar"
      );
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setFinished(false);
    onSaved();
    onOpenChange(false);
  }

  function handleScheduleNext() {
    if (onScheduleNext && shift.patient) {
      onScheduleNext(shift.patientId, shift.userId);
    }
    handleClose();
  }

  function handleCreatePrescription() {
    if (onCreatePrescription) {
      onCreatePrescription(shift.patientId, shift.id);
    }
    handleClose();
  }

  const patientName = shift.patient
    ? `${shift.patient.lastName}, ${shift.patient.firstName}`
    : "Paciente";

  const time = `${new Date(shift.start).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${new Date(shift.end).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[500px]">
        {!finished ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Finalizar Atencion
              </DialogTitle>
              <DialogDescription>
                {patientName} — {time}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="observations">
                  Observaciones de la consulta
                </Label>
                <Textarea
                  id="observations"
                  placeholder="Motivo de consulta, diagnostico, indicaciones, tratamiento..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={5}
                  className="resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Podes agregar observaciones despues desde la historia
                  clinica.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleFinish} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Finalizar Turno
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Turno finalizado
              </DialogTitle>
              <DialogDescription>
                {patientName} fue atendido exitosamente.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                ¿El paciente necesita un proximo turno?
              </p>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                No, cerrar
              </Button>
              {prescriptionsEnabled && onCreatePrescription && (
                <Button variant="outline" onClick={handleCreatePrescription} className="flex-1">
                  <Pill className="mr-2 h-4 w-4" />
                  Crear Receta
                </Button>
              )}
              {onScheduleNext && (
                <Button onClick={handleScheduleNext} className="flex-1">
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Agendar proximo turno
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
