"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

const evolutionSchema = z.object({
  reason: z.string().min(1, "El motivo de consulta es obligatorio"),
  physicalExam: z.string().optional(),
  diagnosis: z.string().optional(),
  diagnosisCode: z.string().optional(),
  treatment: z.string().optional(),
  indications: z.string().optional(),
  notes: z.string().optional(),
});

type EvolutionFormData = z.infer<typeof evolutionSchema>;

interface EvolutionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onCreated: () => void;
}

export function EvolutionFormDialog({
  open,
  onOpenChange,
  patientId,
  onCreated,
}: EvolutionFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EvolutionFormData>({
    resolver: zodResolver(evolutionSchema),
    defaultValues: {
      reason: "",
      physicalExam: "",
      diagnosis: "",
      diagnosisCode: "",
      treatment: "",
      indications: "",
      notes: "",
    },
  });

  async function onSubmit(data: EvolutionFormData) {
    try {
      const body: Record<string, string> = {
        reason: data.reason,
      };
      if (data.physicalExam) body.physicalExam = data.physicalExam;
      if (data.diagnosis) body.diagnosis = data.diagnosis;
      if (data.diagnosisCode) body.diagnosisCode = data.diagnosisCode;
      if (data.treatment) body.treatment = data.treatment;
      if (data.indications) body.indications = data.indications;
      if (data.notes) body.notes = data.notes;

      const res = await fetch(`/api/patients/${patientId}/evolutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al crear la evolucion");
      }

      toast.success("Evolucion creada exitosamente");
      reset();
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear la evolucion"
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) reset();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nueva Evolucion</DialogTitle>
          <DialogDescription>
            Registra una nueva evolucion clinica para este paciente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Motivo de consulta <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Describe el motivo de la consulta..."
              rows={3}
              {...register("reason")}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">
                {errors.reason.message}
              </p>
            )}
          </div>

          {/* Physical exam */}
          <div className="space-y-2">
            <Label htmlFor="physicalExam">Examen fisico</Label>
            <Textarea
              id="physicalExam"
              placeholder="Hallazgos del examen fisico..."
              rows={2}
              {...register("physicalExam")}
            />
          </div>

          {/* Diagnosis + code */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="diagnosis">Diagnostico</Label>
              <Textarea
                id="diagnosis"
                placeholder="Diagnostico..."
                rows={2}
                {...register("diagnosis")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diagnosisCode">Codigo CIE-10</Label>
              <Input
                id="diagnosisCode"
                placeholder="Ej: J06.9"
                {...register("diagnosisCode")}
              />
            </div>
          </div>

          {/* Treatment */}
          <div className="space-y-2">
            <Label htmlFor="treatment">Tratamiento</Label>
            <Textarea
              id="treatment"
              placeholder="Tratamiento indicado..."
              rows={2}
              {...register("treatment")}
            />
          </div>

          {/* Indications */}
          <div className="space-y-2">
            <Label htmlFor="indications">Indicaciones</Label>
            <Textarea
              id="indications"
              placeholder="Indicaciones para el paciente..."
              rows={2}
              {...register("indications")}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas adicionales</Label>
            <Textarea
              id="notes"
              placeholder="Notas internas..."
              rows={2}
              {...register("notes")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar Evolucion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
