"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, X, ClipboardList } from "lucide-react";

// ─── Schema ─────────────────────────────────────────────────────────────────

const studyOrderItemSchema = z.object({
  type: z.enum(["laboratorio", "imagen", "interconsulta", "otro"]),
  description: z.string().min(1, "La descripcion es obligatoria"),
  urgency: z.enum(["normal", "urgente"]).default("normal"),
  notes: z.string().optional(),
});

const studyOrderSchema = z.object({
  items: z.array(studyOrderItemSchema).min(1, "Agrega al menos un estudio"),
});

type StudyOrderFormData = z.infer<typeof studyOrderSchema>;

// ─── Templates ──────────────────────────────────────────────────────────────

interface StudyTemplate {
  label: string;
  items: Array<{
    type: "laboratorio" | "imagen" | "interconsulta" | "otro";
    description: string;
    urgency: "normal" | "urgente";
    notes?: string;
  }>;
}

const QUICK_TEMPLATES: StudyTemplate[] = [
  {
    label: "Lab. basico",
    items: [
      { type: "laboratorio", description: "Hemograma completo", urgency: "normal" },
      { type: "laboratorio", description: "Glucemia", urgency: "normal" },
      { type: "laboratorio", description: "Hepatograma", urgency: "normal" },
    ],
  },
  {
    label: "RX Torax",
    items: [
      { type: "imagen", description: "Radiografia de torax frente y perfil", urgency: "normal" },
    ],
  },
  {
    label: "Eco abdominal",
    items: [
      { type: "imagen", description: "Ecografia abdominal completa", urgency: "normal" },
    ],
  },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface CreateStudyOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  shiftId?: string;
  onCreated: () => void;
}

// ─── Type Labels ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  laboratorio: "Laboratorio",
  imagen: "Imagen",
  interconsulta: "Interconsulta",
  otro: "Otro",
};

const URGENCY_LABELS: Record<string, string> = {
  normal: "Normal",
  urgente: "Urgente",
};

// ─── Main Dialog ────────────────────────────────────────────────────────────

export function CreateStudyOrderDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  shiftId,
  onCreated,
}: CreateStudyOrderDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StudyOrderFormData>({
    resolver: zodResolver(studyOrderSchema),
    defaultValues: {
      items: [{ type: "laboratorio", description: "", urgency: "normal", notes: "" }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "items",
  });

  function applyTemplate(template: StudyTemplate) {
    replace(template.items.map((item) => ({ ...item, notes: item.notes ?? "" })));
  }

  async function onSubmit(data: StudyOrderFormData) {
    try {
      const body = {
        userId: "", // will be set by server from session
        patientId,
        ...(shiftId ? { shiftId } : {}),
        items: data.items.map((item) => ({
          type: item.type,
          description: item.description,
          urgency: item.urgency,
          ...(item.notes ? { notes: item.notes } : {}),
        })),
      };

      const res = await fetch("/api/study-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al crear la orden de estudio");
      }

      toast.success("Orden de estudio creada exitosamente");
      reset();
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear la orden de estudio"
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
            <ClipboardList className="h-5 w-5 text-primary" />
            Nueva Orden de Estudio
          </DialogTitle>
          <DialogDescription>
            Crear orden de estudio para {patientName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Quick Templates */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Plantillas rapidas</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((template) => (
                <Button
                  key={template.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyTemplate(template)}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Estudios</Label>
              {errors.items?.root && (
                <p className="text-sm text-destructive">{errors.items.root.message}</p>
              )}
            </div>

            {fields.map((field, index) => {
              const itemErrors = errors.items?.[index];
              const typeValue = watch(`items.${index}.type`);
              const urgencyValue = watch(`items.${index}.urgency`);

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

                  {/* Type + Urgency */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={typeValue}
                        onValueChange={(val) =>
                          setValue(`items.${index}.type`, val as "laboratorio" | "imagen" | "interconsulta" | "otro", {
                            shouldValidate: true,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {itemErrors?.type && (
                        <p className="text-xs text-destructive">{itemErrors.type.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Urgencia</Label>
                      <Select
                        value={urgencyValue}
                        onValueChange={(val) =>
                          setValue(`items.${index}.urgency`, val as "normal" | "urgente", {
                            shouldValidate: true,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar urgencia" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descripcion</Label>
                    <Input
                      placeholder="Ej: Hemograma completo, Radiografia de torax..."
                      {...register(`items.${index}.description`)}
                    />
                    {itemErrors?.description && (
                      <p className="text-xs text-destructive">{itemErrors.description.message}</p>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notas (opcional)</Label>
                    <Input
                      placeholder="Indicaciones adicionales..."
                      {...register(`items.${index}.notes`)}
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
                append({ type: "laboratorio", description: "", urgency: "normal", notes: "" })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar estudio
            </Button>
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
              Crear Orden
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
