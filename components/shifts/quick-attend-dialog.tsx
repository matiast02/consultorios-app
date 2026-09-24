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
import { Loader2, CheckCircle, CalendarPlus, Pill, Repeat, ClipboardList, Lock } from "lucide-react";
import type { Shift, ModuleConfig } from "@/types";

interface QuickAttendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift;
  onSaved: () => void;
  onScheduleNext?: (patientId: string, medicId: string) => void;
  onScheduleRecurring?: (patientId: string, medicId: string) => void;
  onCreatePrescription?: (patientId: string, shiftId: string) => void;
  onCreateStudyOrder?: (patientId: string, shiftId: string) => void;
}

export function QuickAttendDialog({
  open,
  onOpenChange,
  shift,
  onSaved,
  onScheduleNext,
  onScheduleRecurring,
  onCreatePrescription,
  onCreateStudyOrder,
}: QuickAttendDialogProps) {
  // Evolución clínica (va a la HC, cifrada) vs. nota administrativa (Shift.observations,
  // texto claro visible para recepción). Nunca mezclar datos clínicos en la segunda.
  const [evolutionText, setEvolutionText] = useState("");
  const [adminNote, setAdminNote] = useState(shift.observations ?? "");
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  // El turno ya se marcó FINISHED pero la evolución falló: reintentar solo la evolución.
  const [shiftClosed, setShiftClosed] = useState(false);
  const [evolutionError, setEvolutionError] = useState<string | null>(null);
  const [prescriptionsEnabled, setPrescriptionsEnabled] = useState(false);
  const [studyOrdersEnabled, setStudyOrdersEnabled] = useState(false);

  const checkModules = useCallback(async () => {
    try {
      const res = await fetch("/api/modules");
      if (res.ok) {
        const json = await res.json();
        const modules: ModuleConfig[] = json.data ?? [];
        const prescMod = modules.find((m) => m.module === "prescriptions");
        setPrescriptionsEnabled(prescMod?.enabled ?? false);
        const studyMod = modules.find((m) => m.module === "study_orders");
        setStudyOrdersEnabled(studyMod?.enabled ?? false);
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
    const notes = evolutionText.trim();
    const patientId = shift.patient?.id ?? shift.patientId;
    try {
      setSaving(true);
      setEvolutionError(null);

      // 1) Cerrar el turno (sin texto clínico). Solo la nota administrativa,
      //    y solo si cambió, va a observations.
      if (!shiftClosed) {
        const body: Record<string, unknown> = { status: "FINISHED" };
        if (adminNote !== (shift.observations ?? "")) {
          body.observations = adminNote.trim() || null;
        }
        const res = await fetch(`/api/shifts/${shift.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al finalizar turno");
        }
        setShiftClosed(true);
      }

      // 2) Registrar la evolución en la historia clínica.
      if (notes) {
        if (!patientId) {
          setEvolutionError(
            "No se pudo identificar al paciente. Copiá el texto y cargalo desde su historia clínica."
          );
          toast.error("El turno quedó finalizado, pero la evolución no se guardó");
          return;
        }
        const res = await fetch(`/api/patients/${patientId}/evolutions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shiftId: shift.id, notes }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setEvolutionError(
            res.status === 409
              ? "Este turno ya tiene una evolución registrada. Copiá el texto y agregalo como nueva evolución desde la historia clínica del paciente."
              : `${err.error ?? "No se pudo guardar la evolución"}. Podés reintentar.`
          );
          toast.error("El turno quedó finalizado, pero la evolución no se guardó");
          return; // no cerrar: el texto queda en el diálogo
        }
      }

      toast.success(notes ? "Turno finalizado y evolución registrada" : "Turno finalizado");
      setEvolutionText("");
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
    if (
      !finished &&
      evolutionText.trim() &&
      !window.confirm("La evolución todavía no se guardó. ¿Cerrar y descartar el texto?")
    ) {
      return;
    }
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

  function handleCreateStudyOrder() {
    if (onCreateStudyOrder) {
      onCreateStudyOrder(shift.patientId, shift.id);
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
                Finalizar atención
              </DialogTitle>
              <DialogDescription>
                {patientName} — {time}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="evolution" className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Evolución de la consulta
                </Label>
                <Textarea
                  id="evolution"
                  placeholder="Motivo de consulta, diagnóstico, indicaciones, tratamiento..."
                  value={evolutionText}
                  onChange={(e) => {
                    setEvolutionText(e.target.value);
                    if (evolutionError) setEvolutionError(null);
                  }}
                  rows={5}
                  className="resize-y"
                  aria-invalid={!!evolutionError}
                  aria-describedby="evolution-help"
                />
                <p id="evolution-help" className="text-xs text-muted-foreground">
                  Queda en la historia clínica, cifrada y solo visible para vos.
                  Opcional.
                </p>
                {evolutionError && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {evolutionError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-note">
                  Nota administrativa (visible para recepción)
                </Label>
                <Textarea
                  id="admin-note"
                  placeholder="Ej.: cobrar consulta, pedir autorización a la obra social..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={2}
                  className="resize-y"
                  disabled={shiftClosed}
                  aria-describedby="admin-note-help"
                />
                <p id="admin-note-help" className="text-xs text-muted-foreground">
                  Opcional. No incluyas datos clínicos: se guarda sin cifrar en el turno.
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
                {shiftClosed ? "Reintentar guardar evolución" : "Finalizar turno"}
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
              {studyOrdersEnabled && onCreateStudyOrder && (
                <Button variant="outline" onClick={handleCreateStudyOrder} className="flex-1">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Ordenar estudio
                </Button>
              )}
              {onScheduleNext && (
                <Button onClick={handleScheduleNext} className="flex-1">
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Proximo turno
                </Button>
              )}
              {onScheduleRecurring && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onScheduleRecurring(shift.patientId, shift.userId);
                    onOpenChange(false);
                  }}
                  className="flex-1"
                >
                  <Repeat className="mr-2 h-4 w-4" />
                  Turno recurrente
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
