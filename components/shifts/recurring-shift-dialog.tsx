"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CalendarDays,
  Check,
  AlertTriangle,
  Repeat,
} from "lucide-react";
import { format, addWeeks } from "date-fns";
import { es } from "date-fns/locale";
import type { ConsultationType } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecurringShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  medicId: string;
  medicName?: string;
  defaultDate?: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  onCreated: () => void;
}

interface PreviewDate {
  date: string; // YYYY-MM-DD
  label: string;
  available: boolean;
  reason?: string;
}

const FREQUENCY_OPTIONS = [
  { value: "1", label: "Cada semana" },
  { value: "2", label: "Cada 2 semanas" },
  { value: "3", label: "Cada 3 semanas" },
  { value: "4", label: "Cada mes (4 semanas)" },
];

const COUNT_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: String(i + 2),
  label: `${i + 2} turnos`,
}));

// ─── Component ──────────────────────────────────────────────────────────────

export function RecurringShiftDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  medicId,
  medicName,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  onCreated,
}: RecurringShiftDialogProps) {
  const [frequencyWeeks, setFrequencyWeeks] = useState("2");
  const [count, setCount] = useState("4");
  const [startTime, setStartTime] = useState(defaultStartTime ?? "09:00");
  const [endTime, setEndTime] = useState(defaultEndTime ?? "09:30");
  const [startDate, setStartDate] = useState("");
  const [consultationTypes, setConsultationTypes] = useState<ConsultationType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [previewDates, setPreviewDates] = useState<PreviewDate[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      const baseDate = defaultDate ?? new Date();
      // Start from next occurrence of this weekday
      const nextWeek = addWeeks(baseDate, parseInt(frequencyWeeks));
      setStartDate(format(nextWeek, "yyyy-MM-dd"));
      setStartTime(defaultStartTime ?? "09:00");
      setEndTime(defaultEndTime ?? "09:30");
      setFrequencyWeeks("2");
      setCount("4");
      setSelectedTypeId("");
    }
  }, [open, defaultDate, defaultStartTime, defaultEndTime]);

  // Load consultation types
  useEffect(() => {
    if (!open) return;
    async function load() {
      try {
        const res = await fetch("/api/consultation-types");
        if (res.ok) {
          const json = await res.json();
          setConsultationTypes(json.data ?? []);
        }
      } catch { /* non-critical */ }
    }
    load();
  }, [open]);

  // Auto-calculate end time when type selected
  useEffect(() => {
    if (!selectedTypeId) return;
    const ct = consultationTypes.find((t) => t.id === selectedTypeId);
    if (ct && startTime) {
      const [h, m] = startTime.split(":").map(Number);
      const totalMin = h * 60 + m + ct.durationMinutes;
      const endH = Math.floor(totalMin / 60);
      const endM = totalMin % 60;
      setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
    }
  }, [selectedTypeId, startTime, consultationTypes]);

  // Calculate preview dates
  useEffect(() => {
    if (!startDate || !frequencyWeeks || !count) return;

    const freq = parseInt(frequencyWeeks);
    const numCount = parseInt(count);
    const base = new Date(startDate + "T12:00:00");
    const dates: PreviewDate[] = [];

    for (let i = 0; i < numCount; i++) {
      const d = addWeeks(base, freq * i);
      const ymd = format(d, "yyyy-MM-dd");
      const label = format(d, "EEEE d 'de' MMMM", { locale: es });
      dates.push({ date: ymd, label, available: true }); // Real availability checked server-side
    }

    setPreviewDates(dates);
  }, [startDate, frequencyWeeks, count]);

  async function handleCreate() {
    if (!startDate || !startTime || !endTime) {
      toast.error("Completa todos los campos");
      return;
    }

    if (endTime <= startTime) {
      toast.error("La hora fin debe ser posterior a la hora inicio");
      return;
    }

    try {
      setCreating(true);
      const body: Record<string, unknown> = {
        userId: medicId,
        patientId,
        startDate,
        startTime,
        endTime,
        frequencyWeeks: parseInt(frequencyWeeks),
        count: parseInt(count),
      };

      if (selectedTypeId) {
        body.consultationTypeId = selectedTypeId;
      }

      const res = await fetch("/api/shifts/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al crear turnos recurrentes");
      }

      const json = await res.json();
      const created = json.data?.created?.length ?? 0;
      const skipped = json.data?.skipped?.length ?? 0;

      if (skipped > 0) {
        toast.success(
          `Se crearon ${created} turnos. ${skipped} fueron omitidos por conflictos o bloqueos.`
        );
      } else {
        toast.success(`Se crearon ${created} turnos recurrentes`);
      }

      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear turnos"
      );
    } finally {
      setCreating(false);
    }
  }

  const availableCount = previewDates.filter((d) => d.available).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Turno Recurrente
          </DialogTitle>
          <DialogDescription>
            Programar turnos periodicos para {patientName}
            {medicName ? ` con ${medicName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Consultation Type */}
          {consultationTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de consulta</Label>
              <Select value={selectedTypeId || "__none__"} onValueChange={(v) => setSelectedTypeId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin tipo</SelectItem>
                  {consultationTypes.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>
                      {ct.name} ({ct.durationMinutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Start date */}
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha del primer turno</Label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
            />
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Hora inicio</Label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hora fin</Label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
              />
            </div>
          </div>

          {/* Frequency and count */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Frecuencia</Label>
              <Select value={frequencyWeeks} onValueChange={setFrequencyWeeks}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cantidad</Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Vista previa de turnos</Label>
              <Badge variant="secondary" className="text-xs">
                {availableCount} turnos
              </Badge>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {previewDates.map((d, i) => (
                <div
                  key={d.date}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-xs ${
                    d.available
                      ? "bg-card"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {d.available ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    <span className="capitalize">{d.label}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {startTime} - {endTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || previewDates.length === 0}
          >
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarDays className="mr-2 h-4 w-4" />
            )}
            Crear {availableCount} turnos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
