"use client";

import { useEffect } from "react";
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
import { Loader2 } from "lucide-react";
import type { HealthInsurance } from "@/types";

const healthInsuranceSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  code: z.string().max(20).optional(),
});

type FormValues = z.infer<typeof healthInsuranceSchema>;

interface HealthInsuranceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  healthInsurance?: HealthInsurance | null;
  onSaved: () => void;
}

export function HealthInsuranceDialog({
  open,
  onOpenChange,
  healthInsurance,
  onSaved,
}: HealthInsuranceDialogProps) {
  const isEdit = !!healthInsurance;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(healthInsuranceSchema),
    defaultValues: { name: "", code: "" },
  });

  useEffect(() => {
    if (open) {
      if (healthInsurance) {
        reset({
          name: healthInsurance.name,
          code: healthInsurance.code ?? "",
        });
      } else {
        reset({ name: "", code: "" });
      }
    }
  }, [open, healthInsurance, reset]);

  async function onSubmit(data: FormValues) {
    try {
      const url = isEdit
        ? `/api/health-insurance/${healthInsurance.id}`
        : "/api/health-insurance";
      const method = isEdit ? "PUT" : "POST";

      const body: Record<string, unknown> = {
        name: data.name,
        code: data.code || null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ??
            `Error al ${isEdit ? "actualizar" : "crear"} la obra social`
        );
      }

      toast.success(
        `Obra social ${isEdit ? "actualizada" : "creada"} exitosamente`
      );
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar"
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar Obra Social" : "Nueva Obra Social"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos de la obra social."
              : "Completa los datos para registrar una nueva obra social."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hi-name">Nombre *</Label>
            <Input
              id="hi-name"
              placeholder="Ej: OSDE"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="hi-code">Código</Label>
            <Input
              id="hi-code"
              placeholder="Ej: OSDE-001"
              {...register("code")}
            />
            {errors.code && (
              <p className="text-sm text-destructive">
                {errors.code.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEdit ? "Guardar cambios" : "Crear Obra Social"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
