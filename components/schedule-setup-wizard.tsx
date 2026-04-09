"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Check,
  Clock,
  CalendarDays,
} from "lucide-react";
import { DAY_NAMES } from "@/types";

// ─── Time Select ────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07 to 21
const MINUTES = ["00", "15", "30", "45"];

const TIME_OPTIONS: string[] = [];
for (const h of HOURS) {
  for (const m of MINUTES) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

function TimeSelect({
  value,
  onChange,
  disabled,
  placeholder = "Hora",
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-[100px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {TIME_OPTIONS.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-xs">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface DayConfig {
  day: number;
  enabled: boolean;
  fromHourAM: string;
  toHourAM: string;
  fromHourPM: string;
  toHourPM: string;
}

interface ScheduleSetupWizardProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  userId: string;
  userName?: string;
  /** If true, the dialog cannot be closed/dismissed */
  mandatory?: boolean;
  onComplete: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ScheduleSetupWizard({
  open,
  onOpenChange,
  userId,
  userName,
  mandatory = false,
  onComplete,
}: ScheduleSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<DayConfig[]>(() =>
    Array.from({ length: 7 }, (_, d) => ({
      day: d,
      enabled: d >= 1 && d <= 5, // Mon-Fri by default
      fromHourAM: "",
      toHourAM: "",
      fromHourPM: "",
      toHourPM: "",
    }))
  );

  const enabledDays = days.filter((d) => d.enabled);

  function toggleDay(day: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.day === day
          ? {
              ...d,
              enabled: !d.enabled,
              ...(!d.enabled
                ? {}
                : { fromHourAM: "", toHourAM: "", fromHourPM: "", toHourPM: "" }),
            }
          : d
      )
    );
  }

  function updateDay(day: number, field: keyof DayConfig, value: string) {
    setDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, [field]: value } : d))
    );
  }

  function validate(): string | null {
    if (enabledDays.length === 0) {
      return "Debes seleccionar al menos un dia de trabajo";
    }

    for (const d of enabledDays) {
      const hasAM = d.fromHourAM && d.toHourAM;
      const hasPM = d.fromHourPM && d.toHourPM;

      if (!hasAM && !hasPM) {
        return `${DAY_NAMES[d.day]}: configura al menos un horario (manana o tarde)`;
      }
      if (hasAM && d.fromHourAM >= d.toHourAM) {
        return `${DAY_NAMES[d.day]}: hora inicio manana debe ser menor que fin`;
      }
      if (hasPM && d.fromHourPM >= d.toHourPM) {
        return `${DAY_NAMES[d.day]}: hora inicio tarde debe ser menor que fin`;
      }
    }

    return null;
  }

  function goNext() {
    if (step === 0) {
      if (enabledDays.length === 0) {
        toast.error("Selecciona al menos un dia de trabajo");
        return;
      }
      setStep(1);
    } else if (step === 1) {
      const error = validate();
      if (error) {
        toast.error(error);
        return;
      }
      setStep(2);
    }
  }

  async function save() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    const preferences = days.map((d) => ({
      day: d.day,
      fromHourAM: d.enabled && d.fromHourAM ? d.fromHourAM : null,
      toHourAM: d.enabled && d.toHourAM ? d.toHourAM : null,
      fromHourPM: d.enabled && d.fromHourPM ? d.fromHourPM : null,
      toHourPM: d.enabled && d.toHourPM ? d.toHourPM : null,
    }));

    try {
      setSaving(true);
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, preferences }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar");
      }

      toast.success("Horarios configurados correctamente");
      onComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar los horarios"
      );
    } finally {
      setSaving(false);
    }
  }

  const title = userName
    ? `Configurar horarios de ${userName}`
    : "Configurar horarios de atencion";

  return (
    <Dialog
      open={open}
      onOpenChange={mandatory ? undefined : onOpenChange}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]"
        onPointerDownOutside={mandatory ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={mandatory ? (e) => e.preventDefault() : undefined}
        showCloseButton={!mandatory}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {step === 0 && "Paso 1 de 3: Selecciona los dias que trabajas"}
            {step === 1 && "Paso 2 de 3: Configura los horarios de atencion"}
            {step === 2 && "Paso 3 de 3: Confirma tu configuracion"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step 0: Select days */}
        {step === 0 && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Activa los dias en los que atiendes pacientes.
            </p>
            {days.map((d) => (
              <div
                key={d.day}
                className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                  d.enabled
                    ? "border-primary/30 bg-primary/5"
                    : "border-dashed border-muted"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={d.enabled}
                    onCheckedChange={() => toggleDay(d.day)}
                  />
                  <span
                    className={`text-sm font-medium ${
                      d.enabled ? "" : "text-muted-foreground"
                    }`}
                  >
                    {DAY_NAMES[d.day]}
                  </span>
                </div>
                {d.enabled && (
                  <Badge variant="secondary" className="text-xs">
                    Activo
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Configure hours */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Configura los horarios de manana y/o tarde para cada dia
              habilitado.
            </p>
            {enabledDays.map((d) => (
              <div
                key={d.day}
                className="rounded-lg border p-3 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{DAY_NAMES[d.day]}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* AM */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Manana
                    </p>
                    <div className="flex items-center gap-2">
                      <TimeSelect
                        value={d.fromHourAM}
                        onChange={(v) => updateDay(d.day, "fromHourAM", v)}
                        placeholder="Desde"
                      />
                      <span className="text-xs text-muted-foreground">a</span>
                      <TimeSelect
                        value={d.toHourAM}
                        onChange={(v) => updateDay(d.day, "toHourAM", v)}
                        placeholder="Hasta"
                      />
                    </div>
                  </div>
                  {/* PM */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Tarde
                    </p>
                    <div className="flex items-center gap-2">
                      <TimeSelect
                        value={d.fromHourPM}
                        onChange={(v) => updateDay(d.day, "fromHourPM", v)}
                        placeholder="Desde"
                      />
                      <span className="text-xs text-muted-foreground">a</span>
                      <TimeSelect
                        value={d.toHourPM}
                        onChange={(v) => updateDay(d.day, "toHourPM", v)}
                        placeholder="Hasta"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Summary */}
        {step === 2 && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Revisa la configuracion antes de guardar.
            </p>
            {enabledDays.map((d) => {
              const hasAM = d.fromHourAM && d.toHourAM;
              const hasPM = d.fromHourPM && d.toHourPM;

              return (
                <div
                  key={d.day}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">
                      {DAY_NAMES[d.day]}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {hasAM && (
                      <span className="text-xs text-muted-foreground">
                        Manana: {d.fromHourAM} - {d.toHourAM}
                      </span>
                    )}
                    {hasPM && (
                      <span className="text-xs text-muted-foreground">
                        Tarde: {d.fromHourPM} - {d.toHourPM}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <Separator />
            <p className="text-xs text-muted-foreground">
              Podras modificar estos horarios en cualquier momento desde
              Configuracion.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={saving}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Atras
            </Button>
          )}
          {step < 2 ? (
            <Button type="button" onClick={goNext}>
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Horarios
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
