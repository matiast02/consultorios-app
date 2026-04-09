"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Loader2, Plus, X, Pill } from "lucide-react";
import type { MedicationOption } from "@/types";
import { useProfessionLabels } from "@/hooks/use-profession-labels";

// ─── Schema ─────────────────────────────────────────────────────────────────

const prescriptionItemSchema = z.object({
  medication: z.string().min(1, "El medicamento es obligatorio"),
  dose: z.string().min(1, "La dosis es obligatoria"),
  frequency: z.string().min(1, "La frecuencia es obligatoria"),
  duration: z.string().min(1, "La duracion es obligatoria"),
  notes: z.string().optional(),
});

const prescriptionSchema = z.object({
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, "Agrega al menos un medicamento"),
});

type PrescriptionFormData = z.infer<typeof prescriptionSchema>;

// ─── Props ──────────────────────────────────────────────────────────────────

interface CreatePrescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  shiftId?: string;
  /** The logged-in professional's user ID, used to derive the correct prescription label. */
  userId?: string | null;
  onCreated: () => void;
}

// ─── Medication Combobox ────────────────────────────────────────────────────

function MedicationCombobox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<MedicationOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchMedications = useCallback(async (search: string) => {
    if (search.length < 2) {
      setOptions([]);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/medications?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const json = await res.json();
        setOptions(json.data ?? []);
      }
    } catch {
      // Silently fail — user can still type free text
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(val: string) {
    setQuery(val);
    onChange(val);
    setShowDropdown(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMedications(val), 350);
  }

  function handleSelect(option: MedicationOption) {
    const display = option.genericName
      ? `${option.name} (${option.genericName})`
      : option.name;
    setQuery(display);
    onChange(display);
    setShowDropdown(false);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { if (options.length > 0) setShowDropdown(true); }}
        placeholder={placeholder ?? "Buscar medicamento..."}
        className="w-full"
      />
      {showDropdown && (options.length > 0 || loading) && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
              onClick={() => handleSelect(opt)}
            >
              <span className="font-medium">{opt.name}</span>
              {(opt.genericName || opt.presentation) && (
                <span className="text-xs text-muted-foreground">
                  {[opt.genericName, opt.presentation].filter(Boolean).join(" - ")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dialog ────────────────────────────────────────────────────────────

export function CreatePrescriptionDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  shiftId,
  userId,
  onCreated,
}: CreatePrescriptionDialogProps) {
  const labels = useProfessionLabels(userId);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PrescriptionFormData>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      diagnosis: "",
      notes: "",
      items: [{ medication: "", dose: "", frequency: "", duration: "", notes: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  async function onSubmit(data: PrescriptionFormData) {
    try {
      const body = {
        patientId,
        ...(shiftId ? { shiftId } : {}),
        items: data.items.map((item) => ({
          medication: item.medication,
          dose: item.dose,
          frequency: item.frequency,
          duration: item.duration,
          ...(item.notes ? { notes: item.notes } : {}),
        })),
        ...(data.diagnosis ? { diagnosis: data.diagnosis } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
      };

      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al crear la receta");
      }

      toast.success(`${labels.prescriptionLabel} creada exitosamente`);
      reset();
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear la receta"
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            Nueva {labels.prescriptionLabel}
          </DialogTitle>
          <DialogDescription>
            Crear {labels.prescriptionLabel.toLowerCase()} para {patientName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Diagnosis */}
          <div className="space-y-2">
            <Label htmlFor="prescription-diagnosis">Diagnostico</Label>
            <Input
              id="prescription-diagnosis"
              placeholder="Diagnostico (opcional)..."
              {...register("diagnosis")}
            />
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Medicamentos</Label>
              {errors.items?.root && (
                <p className="text-sm text-destructive">{errors.items.root.message}</p>
              )}
            </div>

            {fields.map((field, index) => {
              const itemErrors = errors.items?.[index];
              const medicationValue = watch(`items.${index}.medication`);

              return (
                <div
                  key={field.id}
                  className="relative rounded-lg border bg-muted/30 p-4 space-y-3"
                >
                  {/* Remove button */}
                  {fields.length > 1 && (
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

                  {/* Medication combobox */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Medicamento</Label>
                    <MedicationCombobox
                      value={medicationValue ?? ""}
                      onChange={(val) => setValue(`items.${index}.medication`, val, { shouldValidate: true })}
                      placeholder="Buscar medicamento..."
                    />
                    {itemErrors?.medication && (
                      <p className="text-xs text-destructive">{itemErrors.medication.message}</p>
                    )}
                  </div>

                  {/* Dose + Frequency */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Dosis</Label>
                      <Input
                        placeholder="Ej: 500mg"
                        {...register(`items.${index}.dose`)}
                      />
                      {itemErrors?.dose && (
                        <p className="text-xs text-destructive">{itemErrors.dose.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Frecuencia</Label>
                      <Input
                        placeholder="Ej: cada 8 horas"
                        {...register(`items.${index}.frequency`)}
                      />
                      {itemErrors?.frequency && (
                        <p className="text-xs text-destructive">{itemErrors.frequency.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Duration + Notes */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Duracion</Label>
                      <Input
                        placeholder="Ej: 7 dias"
                        {...register(`items.${index}.duration`)}
                      />
                      {itemErrors?.duration && (
                        <p className="text-xs text-destructive">{itemErrors.duration.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Notas</Label>
                      <Input
                        placeholder="Indicaciones adicionales..."
                        {...register(`items.${index}.notes`)}
                      />
                    </div>
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
                append({ medication: "", dose: "", frequency: "", duration: "", notes: "" })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar medicamento
            </Button>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="prescription-notes">Notas adicionales</Label>
            <Textarea
              id="prescription-notes"
              placeholder="Indicaciones generales, observaciones..."
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
              Crear {labels.prescriptionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
