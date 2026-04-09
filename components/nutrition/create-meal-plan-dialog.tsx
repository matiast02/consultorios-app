"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, X, UtensilsCrossed, AlertTriangle } from "lucide-react";
import type { MealPlan, MealSection } from "@/types";
import { MEAL_PLAN_TYPES, DEFAULT_MEAL_SECTIONS } from "@/types";

// ─── Meal-time icons ────────────────────────────────────────────────────────

const MEAL_ICONS: Record<string, string> = {
  "Desayuno": "☀️",
  "Media mañana": "🫖",
  "Almuerzo": "🍽️",
  "Merienda": "🌅",
  "Media tarde": "🌆",
  "Cena": "🌙",
};

function getMealIcon(name: string): string {
  return MEAL_ICONS[name] ?? "🍴";
}

// ─── Schema ─────────────────────────────────────────────────────────────────

const mealSectionFormSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  time: z.string().optional(),
  options: z.string(),
  isDefault: z.boolean().optional(),
});

const mealPlanFormSchema = z.object({
  title: z.string().min(1, "El titulo es obligatorio"),
  targetCalories: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  proteinPct: z.coerce.number().int().min(0).max(100).nullable().optional(),
  carbsPct: z.coerce.number().int().min(0).max(100).nullable().optional(),
  fatPct: z.coerce.number().int().min(0).max(100).nullable().optional(),
  hydration: z.string().optional(),
  meals: z.array(mealSectionFormSchema).min(1, "Agregar al menos una comida"),
  avoidFoods: z.string().optional(),
  supplements: z.string().optional(),
  notes: z.string().optional(),
});

type MealPlanFormData = z.infer<typeof mealPlanFormSchema>;

// ─── Props ──────────────────────────────────────────────────────────────────

interface CreateMealPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  userId?: string | null;
  editPlan?: MealPlan | null;
  onCreated: () => void;
}

// ─── Main Dialog ────────────────────────────────────────────────────────────

export function CreateMealPlanDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  userId,
  editPlan,
  onCreated,
}: CreateMealPlanDialogProps) {
  const isEdit = !!editPlan;
  const [showSuggestions, setShowSuggestions] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MealPlanFormData>({
    resolver: zodResolver(mealPlanFormSchema),
    defaultValues: {
      title: "",
      targetCalories: null,
      proteinPct: null,
      carbsPct: null,
      fatPct: null,
      hydration: "",
      meals: DEFAULT_MEAL_SECTIONS.map((s) => ({
        name: s.name,
        time: s.time ?? "",
        options: "",
        isDefault: true,
      })),
      avoidFoods: "",
      supplements: "",
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "meals",
  });

  const titleValue = watch("title");
  const proteinPct = watch("proteinPct");
  const carbsPct = watch("carbsPct");
  const fatPct = watch("fatPct");

  // Macro % validation warning
  const macroSum =
    (Number(proteinPct) || 0) + (Number(carbsPct) || 0) + (Number(fatPct) || 0);
  const hasMacroInput =
    (Number(proteinPct) || 0) > 0 ||
    (Number(carbsPct) || 0) > 0 ||
    (Number(fatPct) || 0) > 0;
  const macroSumInvalid = hasMacroInput && macroSum !== 100;

  // Filtered suggestions based on current input
  const filteredSuggestions = MEAL_PLAN_TYPES.filter(
    (t) => !titleValue || t.toLowerCase().includes(titleValue.toLowerCase())
  );

  async function onSubmit(data: MealPlanFormData) {
    try {
      const body = {
        userId: userId ?? "",
        patientId,
        title: data.title,
        targetCalories: data.targetCalories || null,
        proteinPct: data.proteinPct || null,
        carbsPct: data.carbsPct || null,
        fatPct: data.fatPct || null,
        hydration: data.hydration || null,
        meals: data.meals.map((m) => ({
          name: m.name,
          time: m.time || undefined,
          options: m.options,
        })),
        avoidFoods: data.avoidFoods || null,
        supplements: data.supplements || null,
        notes: data.notes || null,
      };

      const url = isEdit ? `/api/meal-plans/${editPlan!.id}` : "/api/meal-plans";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Error al ${isEdit ? "actualizar" : "crear"} el plan alimentario`);
      }

      toast.success(`Plan alimentario ${isEdit ? "actualizado" : "creado"} exitosamente`);
      reset();
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear el plan alimentario"
      );
    }
  }

  function handleSelectSuggestion(type: string) {
    setValue("title", type, { shouldValidate: true });
    setShowSuggestions(false);
  }

  // Populate form when editing
  const lastEditId = useRef<string | null>(null);
  useEffect(() => {
    if (open && editPlan && lastEditId.current !== editPlan.id) {
      try {
        const meals: MealSection[] = JSON.parse(editPlan.meals);
        reset({
          title: editPlan.title,
          targetCalories: editPlan.targetCalories ?? undefined,
          proteinPct: editPlan.proteinPct ?? undefined,
          carbsPct: editPlan.carbsPct ?? undefined,
          fatPct: editPlan.fatPct ?? undefined,
          hydration: editPlan.hydration ?? "",
          meals: meals.map((m) => ({
            name: m.name,
            time: m.time ?? "",
            options: m.options,
            isDefault: DEFAULT_MEAL_SECTIONS.some((d) => d.name === m.name),
          })),
          avoidFoods: editPlan.avoidFoods ?? "",
          supplements: editPlan.supplements ?? "",
          notes: editPlan.notes ?? "",
        });
        lastEditId.current = editPlan.id;
      } catch { /* invalid JSON */ }
    }
    if (!open) {
      lastEditId.current = null;
    }
  }, [open, editPlan, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) reset();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[750px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            {isEdit ? "Editar Plan Alimentario" : "Nuevo Plan Alimentario"}
          </DialogTitle>
          <DialogDescription>
            Crear plan alimentario para {patientName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Title with autocomplete suggestions */}
          <div className="space-y-2">
            <Label htmlFor="meal-plan-title">Titulo del plan</Label>
            <div className="relative">
              <Input
                id="meal-plan-title"
                placeholder="Ej: Plan hipocalórico..."
                autoComplete="off"
                {...register("title")}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  // Small delay to allow mousedown on suggestion to fire first
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {filteredSuggestions.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className="flex w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors first:rounded-t-md last:rounded-b-md"
                      onMouseDown={(e) => {
                        // Prevent blur from firing before click
                        e.preventDefault();
                        handleSelectSuggestion(type);
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Macros row — always visible */}
          <div className="space-y-2">
            <Label>Macronutrientes</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Calorias (kcal)</Label>
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  placeholder="2000"
                  {...register("targetCalories", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Proteinas %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="30"
                  {...register("proteinPct", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Carbohidratos %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="40"
                  {...register("carbsPct", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Grasas %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="30"
                  {...register("fatPct", { valueAsNumber: true })}
                />
              </div>
            </div>
            {/* Macro % sum warning */}
            {macroSumInvalid && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Los porcentajes de macros suman{" "}
                  <span className="font-semibold">{macroSum}%</span> — deben
                  sumar 100% (faltan {macroSum < 100 ? 100 - macroSum : macroSum - 100}%).
                </p>
              </div>
            )}
            {hasMacroInput && macroSum === 100 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Macros: {macroSum}% — correcto.
              </p>
            )}
          </div>

          {/* Hydration */}
          <div className="space-y-2">
            <Label htmlFor="meal-plan-hydration">Hidratacion</Label>
            <Input
              id="meal-plan-hydration"
              placeholder="Ej: 2 litros de agua/dia"
              {...register("hydration")}
            />
          </div>

          <Separator />

          {/* Meal Sections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Comidas</Label>
              {errors.meals?.root && (
                <p className="text-sm text-destructive">{errors.meals.root.message}</p>
              )}
            </div>

            {fields.map((field, index) => {
              const isDefault = field.isDefault === true;
              const mealIcon = getMealIcon(field.name);

              return (
                <div
                  key={field.id}
                  className="relative rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm"
                >
                  {/* Remove button — only for custom (non-default) sections */}
                  {!isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Name + Time row */}
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Comida</Label>
                      {isDefault ? (
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none" aria-hidden="true">
                            {mealIcon}
                          </span>
                          <span className="text-sm font-semibold">{field.name}</span>
                        </div>
                      ) : (
                        <Input
                          placeholder="Nombre de la comida"
                          {...register(`meals.${index}.name`)}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Horario</Label>
                      <Input
                        placeholder="07:30 - 08:30"
                        className="w-full sm:w-[150px]"
                        {...register(`meals.${index}.time`)}
                      />
                    </div>
                  </div>

                  {/* Options textarea */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Opciones y porciones</Label>
                    <Textarea
                      placeholder="Opciones de alimentos, porciones, alternativas..."
                      rows={3}
                      {...register(`meals.${index}.options`)}
                    />
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                append({
                  name: "",
                  time: "",
                  options: "",
                  isDefault: false,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar comida
            </Button>
          </div>

          <Separator />

          {/* Avoid Foods */}
          <div className="space-y-2">
            <Label htmlFor="meal-plan-avoid">Alimentos a evitar</Label>
            <Textarea
              id="meal-plan-avoid"
              placeholder="Alimentos que el paciente debe evitar..."
              rows={3}
              {...register("avoidFoods")}
            />
          </div>

          {/* Supplements */}
          <div className="space-y-2">
            <Label htmlFor="meal-plan-supplements">Suplementos</Label>
            <Textarea
              id="meal-plan-supplements"
              placeholder="Suplementos recomendados..."
              rows={2}
              {...register("supplements")}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="meal-plan-notes">Observaciones generales</Label>
            <Textarea
              id="meal-plan-notes"
              placeholder="Indicaciones generales, recomendaciones..."
              rows={3}
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
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear Plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
