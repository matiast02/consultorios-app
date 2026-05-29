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
  Loader2,
  Check,
  Stethoscope,
  Shield,
  Award,
  User,
  Briefcase,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Schema ──────────────────────────────────────────────────────────────────

const specializationSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  professionConfigId: z.string().nullable().optional(),
  color: z.string(),
});

type FormValues = z.infer<typeof specializationSchema>;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProfessionConfigOption {
  id: string;
  code: string;
  name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#0d9488", // teal
  "#2563eb", // blue
  "#8b5cf6", // violet
  "#db2777", // pink
  "#d97706", // amber
  "#16a34a", // green
];

const PROFESSION_ICONS: Record<string, LucideIcon> = {
  medic: Stethoscope,
  nurse: Shield,
  kinesiologist: Award,
  physiotherapist: Award,
  psychologist: User,
  nutritionist: Briefcase,
  dentist: Stethoscope,
};

function professionIcon(code: string): LucideIcon {
  return PROFESSION_ICONS[code] ?? Stethoscope;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SpecializationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specialization?: {
    id: string;
    name: string;
    color?: string | null;
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
  const [existingNames, setExistingNames] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(specializationSchema),
    defaultValues: { name: "", professionConfigId: null, color: COLOR_PALETTE[0] },
  });

  const name = watch("name");
  const professionConfigId = watch("professionConfigId");
  const color = watch("color");

  // Fetch profession configs + existing names when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/profession-configs")
      .then((res) => res.json())
      .then((json) => setProfessionConfigs(json.data ?? []))
      .catch(() => setProfessionConfigs([]));
    fetch("/api/specializations")
      .then((res) => res.json())
      .then((json) => {
        const list = Array.isArray(json.data) ? json.data : [];
        setExistingNames(
          list
            .filter((s: { id: string }) => s.id !== specialization?.id)
            .map((s: { name: string }) => s.name.trim().toLowerCase())
        );
      })
      .catch(() => setExistingNames([]));
  }, [open, specialization?.id]);

  useEffect(() => {
    if (!open) return;
    if (specialization) {
      reset({
        name: specialization.name,
        professionConfigId: specialization.professionConfigId ?? null,
        color: specialization.color ?? COLOR_PALETTE[0],
      });
    } else {
      reset({ name: "", professionConfigId: null, color: COLOR_PALETTE[0] });
    }
  }, [open, specialization, reset]);

  // Name availability
  const trimmedName = name?.trim().toLowerCase() ?? "";
  const nameTaken = trimmedName.length > 0 && existingNames.includes(trimmedName);
  const nameAvailable = trimmedName.length > 0 && !nameTaken;

  const selectedProfession = professionConfigs.find((p) => p.id === professionConfigId);

  async function onSubmit(data: FormValues) {
    if (existingNames.includes(data.name.trim().toLowerCase())) {
      toast.error("Ya existe una especialidad con ese nombre");
      return;
    }
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
          color: data.color || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ?? `Error al ${isEdit ? "actualizar" : "crear"} la especialidad`
        );
      }

      toast.success(`Especialidad ${isEdit ? "actualizada" : "creada"} exitosamente`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {isEdit ? "Editar especialidad" : "Nueva especialidad"}
          </DialogTitle>
          <DialogDescription>
            Define cómo se mostrará en la agenda y el perfil del profesional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="spec-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              {nameAvailable && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  Disponible
                </span>
              )}
              {nameTaken && (
                <span className="text-xs font-medium text-destructive">
                  En uso
                </span>
              )}
            </div>
            <Input
              id="spec-name"
              placeholder="Ej: Ecocardiografía"
              aria-invalid={nameTaken || undefined}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Profession */}
          <div className="space-y-2">
            <Label>Profesión asociada</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {professionConfigs.map((pc) => {
                const Icon = professionIcon(pc.code);
                const selected = professionConfigId === pc.id;
                return (
                  <button
                    key={pc.id}
                    type="button"
                    onClick={() => setValue("professionConfigId", pc.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                      selected
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-input text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{pc.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setValue("professionConfigId", null)}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-medium transition-colors",
                professionConfigId == null
                  ? "border-primary/60 bg-primary/5 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              <Users className="h-4 w-4 shrink-0" />
              Sin profesión — disponible para todos
            </button>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2.5">
              {COLOR_PALETTE.map((c) => {
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue("color", c)}
                    aria-label={`Color ${c}`}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105",
                      selected && "ring-2 ring-offset-2 ring-offset-background"
                    )}
                    style={{
                      backgroundColor: c,
                      ...(selected ? { ["--tw-ring-color" as string]: c } : {}),
                    }}
                  >
                    {selected && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agenda preview */}
          <div className="rounded-lg border border-dashed bg-muted/30 p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Así se verá en la agenda
            </p>
            <div
              className="mt-2 flex items-center gap-3 rounded-md border bg-card p-3"
              style={{ borderLeftColor: color, borderLeftWidth: 3 }}
            >
              <span className="text-sm font-medium text-muted-foreground">09:30</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  Martín Acosta
                </p>
                <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {name?.trim() || "Especialidad"}
                  {selectedProfession ? ` · ${selectedProfession.name}` : ""}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || nameTaken}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isEdit ? "Guardar cambios" : "Crear especialidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
