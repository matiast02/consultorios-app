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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import type { ConsultationType } from "@/types";

// ─── Schema ──────────────────────────────────────────────────────────────────

const consultationTypeSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  durationMinutes: z.coerce.number().int().min(5, "Minimo 5 minutos").max(120, "Maximo 120 minutos"),
  color: z.string().optional().default(""),
  isDefault: z.boolean().optional().default(false),
});

type FormValues = z.infer<typeof consultationTypeSchema>;

// ─── Component ───────────────────────────────────────────────────────────────

interface ConsultationTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultationType?: ConsultationType | null;
  onSaved: () => void;
}

export function ConsultationTypeDialog({
  open,
  onOpenChange,
  consultationType,
  onSaved,
}: ConsultationTypeDialogProps) {
  const isEdit = !!consultationType;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(consultationTypeSchema),
    defaultValues: {
      name: "",
      durationMinutes: 30,
      color: "",
      isDefault: false,
    },
  });

  const isDefaultValue = watch("isDefault");

  useEffect(() => {
    if (open) {
      if (consultationType) {
        reset({
          name: consultationType.name,
          durationMinutes: consultationType.durationMinutes,
          color: consultationType.color ?? "",
          isDefault: consultationType.isDefault,
        });
      } else {
        reset({
          name: "",
          durationMinutes: 30,
          color: "",
          isDefault: false,
        });
      }
    }
  }, [open, consultationType, reset]);

  async function onSubmit(data: FormValues) {
    try {
      const url = isEdit
        ? `/api/consultation-types/${consultationType.id}`
        : "/api/consultation-types";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          durationMinutes: data.durationMinutes,
          color: data.color || null,
          isDefault: data.isDefault,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ??
            `Error al ${isEdit ? "actualizar" : "crear"} el tipo de consulta`
        );
      }

      toast.success(
        `Tipo de consulta ${isEdit ? "actualizado" : "creado"} exitosamente`
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
            {isEdit ? "Editar Tipo de Consulta" : "Nuevo Tipo de Consulta"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos del tipo de consulta."
              : "Completa los datos para registrar un nuevo tipo de consulta."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ct-name">Nombre *</Label>
            <Input
              id="ct-name"
              placeholder="Ej: Primera vez"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ct-duration">Duracion (minutos) *</Label>
            <Input
              id="ct-duration"
              type="number"
              min={5}
              max={120}
              placeholder="30"
              {...register("durationMinutes")}
            />
            {errors.durationMinutes && (
              <p className="text-sm text-destructive">
                {errors.durationMinutes.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ct-color">Color (hex)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ct-color"
                placeholder="#8B5CF6"
                {...register("color")}
                className="flex-1"
              />
              {watch("color") && (
                <div
                  className="h-9 w-9 shrink-0 rounded-md border"
                  style={{ backgroundColor: watch("color") }}
                />
              )}
            </div>
            {errors.color && (
              <p className="text-sm text-destructive">
                {errors.color.message}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="ct-default"
              checked={isDefaultValue}
              onCheckedChange={(checked) =>
                setValue("isDefault", checked === true)
              }
            />
            <Label htmlFor="ct-default" className="cursor-pointer">
              Tipo por defecto
            </Label>
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
              {isEdit ? "Guardar cambios" : "Crear Tipo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
