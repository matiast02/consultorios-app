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
import { ALL_CLINICAL_FIELDS } from "@/lib/profession-labels";

// ─── Schema ──────────────────────────────────────────────────────────────────

const professionConfigSchema = z.object({
  code: z.string().min(1, "El codigo es obligatorio").max(50),
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  professionalLabel: z.string().min(1, "El prefijo es obligatorio").max(20),
  patientLabel: z.string().min(1).max(50).default("Paciente"),
  prescriptionLabel: z.string().min(1, "La etiqueta de receta es obligatoria").max(50),
  evolutionLabel: z.string().min(1, "La etiqueta de evolucion es obligatoria").max(50),
  clinicalRecordLabel: z.string().min(1, "La etiqueta de HC es obligatoria").max(50),
  enabledModules: z.array(z.string()).default([]),
  clinicalFields: z.array(z.string()).default([]),
});

type FormValues = z.infer<typeof professionConfigSchema>;

// ─── Available modules ──────────────────────────────────────────────────────

const AVAILABLE_MODULES = [
  { value: "prescriptions", label: "Recetas Medicas" },
  { value: "study_orders", label: "Ordenes de Estudio" },
];

// ─── Clinical fields from profession-labels ─────────────────────────────────

const CLINICAL_FIELD_OPTIONS = Object.entries(ALL_CLINICAL_FIELDS).map(
  ([key, def]) => ({
    value: key,
    label: def.label,
  })
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProfessionConfigData {
  id: string;
  code: string;
  name: string;
  professionalLabel: string;
  patientLabel: string;
  prescriptionLabel: string;
  evolutionLabel: string;
  clinicalRecordLabel: string;
  enabledModules: string; // JSON
  clinicalFields: string; // JSON
}

interface ProfessionConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionConfig?: ProfessionConfigData | null;
  onSaved: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProfessionConfigDialog({
  open,
  onOpenChange,
  professionConfig,
  onSaved,
}: ProfessionConfigDialogProps) {
  const isEdit = !!professionConfig;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(professionConfigSchema),
    defaultValues: {
      code: "",
      name: "",
      professionalLabel: "",
      patientLabel: "Paciente",
      prescriptionLabel: "",
      evolutionLabel: "",
      clinicalRecordLabel: "",
      enabledModules: [],
      clinicalFields: [],
    },
  });

  const enabledModules = watch("enabledModules");
  const clinicalFields = watch("clinicalFields");

  useEffect(() => {
    if (open) {
      if (professionConfig) {
        let modules: string[] = [];
        let fields: string[] = [];
        try {
          modules = JSON.parse(professionConfig.enabledModules);
        } catch { /* empty */ }
        try {
          fields = JSON.parse(professionConfig.clinicalFields);
        } catch { /* empty */ }

        reset({
          code: professionConfig.code,
          name: professionConfig.name,
          professionalLabel: professionConfig.professionalLabel,
          patientLabel: professionConfig.patientLabel,
          prescriptionLabel: professionConfig.prescriptionLabel,
          evolutionLabel: professionConfig.evolutionLabel,
          clinicalRecordLabel: professionConfig.clinicalRecordLabel,
          enabledModules: modules,
          clinicalFields: fields,
        });
      } else {
        reset({
          code: "",
          name: "",
          professionalLabel: "",
          patientLabel: "Paciente",
          prescriptionLabel: "",
          evolutionLabel: "",
          clinicalRecordLabel: "",
          enabledModules: [],
          clinicalFields: [],
        });
      }
    }
  }, [open, professionConfig, reset]);

  function toggleModule(mod: string) {
    const current = enabledModules ?? [];
    if (current.includes(mod)) {
      setValue(
        "enabledModules",
        current.filter((m) => m !== mod)
      );
    } else {
      setValue("enabledModules", [...current, mod]);
    }
  }

  function toggleField(field: string) {
    const current = clinicalFields ?? [];
    if (current.includes(field)) {
      setValue(
        "clinicalFields",
        current.filter((f) => f !== field)
      );
    } else {
      setValue("clinicalFields", [...current, field]);
    }
  }

  async function onSubmit(data: FormValues) {
    try {
      const url = isEdit
        ? `/api/profession-configs/${professionConfig.id}`
        : "/api/profession-configs";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ??
            `Error al ${isEdit ? "actualizar" : "crear"} la configuracion`
        );
      }

      toast.success(
        `Configuracion ${isEdit ? "actualizada" : "creada"} exitosamente`
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
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar Configuracion de Profesion" : "Nueva Configuracion de Profesion"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos de la configuracion de profesion."
              : "Completa los datos para registrar una nueva configuracion de profesion."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pc-code">Codigo *</Label>
              <Input
                id="pc-code"
                placeholder="Ej: medic"
                {...register("code")}
              />
              {errors.code && (
                <p className="text-sm text-destructive">{errors.code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pc-name">Nombre *</Label>
              <Input
                id="pc-name"
                placeholder="Ej: Medico"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pc-professional">Prefijo profesional *</Label>
              <Input
                id="pc-professional"
                placeholder="Ej: Dr/a."
                {...register("professionalLabel")}
              />
              {errors.professionalLabel && (
                <p className="text-sm text-destructive">
                  {errors.professionalLabel.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pc-patient">Etiqueta paciente</Label>
              <Input
                id="pc-patient"
                placeholder="Paciente"
                {...register("patientLabel")}
              />
              {errors.patientLabel && (
                <p className="text-sm text-destructive">
                  {errors.patientLabel.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-prescription">Etiqueta de receta *</Label>
            <Input
              id="pc-prescription"
              placeholder="Ej: Receta"
              {...register("prescriptionLabel")}
            />
            {errors.prescriptionLabel && (
              <p className="text-sm text-destructive">
                {errors.prescriptionLabel.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-evolution">Etiqueta de evolucion *</Label>
            <Input
              id="pc-evolution"
              placeholder="Ej: Evolucion"
              {...register("evolutionLabel")}
            />
            {errors.evolutionLabel && (
              <p className="text-sm text-destructive">
                {errors.evolutionLabel.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-clinical">Etiqueta de historia clinica *</Label>
            <Input
              id="pc-clinical"
              placeholder="Ej: Historia Clinica"
              {...register("clinicalRecordLabel")}
            />
            {errors.clinicalRecordLabel && (
              <p className="text-sm text-destructive">
                {errors.clinicalRecordLabel.message}
              </p>
            )}
          </div>

          {/* Modules checkboxes */}
          <div className="space-y-2">
            <Label>Modulos habilitados</Label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_MODULES.map((mod) => (
                <div key={mod.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`mod-${mod.value}`}
                    checked={enabledModules?.includes(mod.value) ?? false}
                    onCheckedChange={() => toggleModule(mod.value)}
                  />
                  <Label
                    htmlFor={`mod-${mod.value}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {mod.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Clinical fields checkboxes */}
          <div className="space-y-2">
            <Label>Campos clinicos</Label>
            <div className="grid grid-cols-2 gap-2">
              {CLINICAL_FIELD_OPTIONS.map((field) => (
                <div key={field.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`field-${field.value}`}
                    checked={clinicalFields?.includes(field.value) ?? false}
                    onCheckedChange={() => toggleField(field.value)}
                  />
                  <Label
                    htmlFor={`field-${field.value}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
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
              {isEdit ? "Guardar cambios" : "Crear Configuracion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
