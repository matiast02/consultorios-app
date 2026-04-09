"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

// ─── Schema ──────────────────────────────────────────────────────────────────

const specializationSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  professionConfigId: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof specializationSchema>;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProfessionConfigOption {
  id: string;
  name: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SpecializationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specialization?: {
    id: string;
    name: string;
    professionConfigId?: string | null;
  } | null;
  onSaved: () => void;
}

export function SpecializationDialog({
  open,
  onOpenChange,
  specialization,
  onSaved,
}: SpecializationDialogProps) {
  const isEdit = !!specialization;
  const [professionConfigs, setProfessionConfigs] = useState<ProfessionConfigOption[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(specializationSchema),
    defaultValues: { name: "", professionConfigId: null },
  });

  const professionConfigId = watch("professionConfigId");

  // Fetch profession configs when dialog opens
  useEffect(() => {
    if (open) {
      fetch("/api/profession-configs")
        .then((res) => res.json())
        .then((json) => {
          setProfessionConfigs(json.data ?? []);
        })
        .catch(() => {
          setProfessionConfigs([]);
        });
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (specialization) {
        reset({
          name: specialization.name,
          professionConfigId: specialization.professionConfigId ?? null,
        });
      } else {
        reset({ name: "", professionConfigId: null });
      }
    }
  }, [open, specialization, reset]);

  async function onSubmit(data: FormValues) {
    try {
      const url = isEdit
        ? `/api/specializations/${specialization.id}`
        : "/api/specializations";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          professionConfigId: data.professionConfigId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ??
            `Error al ${isEdit ? "actualizar" : "crear"} la especialidad`
        );
      }

      toast.success(
        `Especialidad ${isEdit ? "actualizada" : "creada"} exitosamente`
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
            {isEdit ? "Editar Especialidad" : "Nueva Especialidad"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos de la especialidad."
              : "Completa los datos para registrar una nueva especialidad."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="spec-name">Nombre *</Label>
            <Input
              id="spec-name"
              placeholder="Ej: Cardiologia"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="spec-profession">Profesion</Label>
            <Select
              value={professionConfigId ?? "__none__"}
              onValueChange={(value) =>
                setValue(
                  "professionConfigId",
                  value === "__none__" ? null : value
                )
              }
            >
              <SelectTrigger id="spec-profession">
                <SelectValue placeholder="Sin profesion asignada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin profesion asignada</SelectItem>
                {professionConfigs.map((pc) => (
                  <SelectItem key={pc.id} value={pc.id}>
                    {pc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {isEdit ? "Guardar cambios" : "Crear Especialidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
