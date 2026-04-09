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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { AlertTriangle, CalendarIcon, Check, ChevronsUpDown, Loader2, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient, Medic, UserPreference, BlockDay } from "@/types";
import { DAY_NAMES } from "@/types";

const createShiftSchema = z.object({
  patientId: z.string().min(1, "Selecciona un paciente"),
  date: z.string().min(1, "Selecciona una fecha"),
  startTime: z.string().min(1, "Selecciona hora de inicio"),
  endTime: z.string().min(1, "Selecciona hora de fin"),
  medicId: z.string().optional(),
});

type CreateShiftForm = z.infer<typeof createShiftSchema>;

interface CreateShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultPatientId?: string;
  defaultMedicId?: string;
  onCreated: () => void;
}

export function CreateShiftDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  defaultPatientId,
  defaultMedicId,
  onCreated,
}: CreateShiftDialogProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medics, setMedics] = useState<Medic[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientPopoverOpen, setPatientPopoverOpen] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateShiftForm>({
    resolver: zodResolver(createShiftSchema),
    defaultValues: {
      patientId: defaultPatientId ?? "",
      date: defaultDate
        ? defaultDate.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      startTime: defaultStartTime ?? "09:00",
      endTime: defaultEndTime ?? "09:30",
      medicId: defaultMedicId ?? "",
    },
  });

  const selectedPatientId = watch("patientId");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      reset({
        patientId: defaultPatientId ?? "",
        date: defaultDate
          ? defaultDate.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        startTime: defaultStartTime ?? "09:00",
        endTime: defaultEndTime ?? "09:30",
        medicId: defaultMedicId ?? "",
      });
    }
  }, [open, defaultDate, defaultStartTime, defaultEndTime, defaultPatientId, defaultMedicId, reset]);

  // Fetch patients
  useEffect(() => {
    if (!open) return;
    async function loadPatients() {
      setLoadingPatients(true);
      try {
        const res = await fetch("/api/patients?limit=500");
        if (res.ok) {
          const json = await res.json();
          const list = json.data ?? [];
          setPatients(Array.isArray(list) ? list : []);
        }
      } catch {
        toast.error("Error al cargar pacientes");
      } finally {
        setLoadingPatients(false);
      }
    }
    loadPatients();
  }, [open]);

  // Fetch medics
  useEffect(() => {
    if (!open) return;
    async function loadMedics() {
      try {
        const res = await fetch("/api/users/medics");
        if (res.ok) {
          const json = await res.json();
          const list = json.data ?? [];
          setMedics(Array.isArray(list) ? list : []);
        }
      } catch {
        // Not critical - medic selection is optional
      }
    }
    loadMedics();
  }, [open]);

  // ─── Availability validation ──────────────────────────────────────────────
  const [medicPreferences, setMedicPreferences] = useState<UserPreference[]>([]);
  const [medicBlockDays, setMedicBlockDays] = useState<BlockDay[]>([]);

  const watchedDate = watch("date");
  const watchedStartTime = watch("startTime");
  const watchedEndTime = watch("endTime");
  const watchedMedicId = watch("medicId");

  // Fetch availability when medic or date changes
  useEffect(() => {
    const medicId = watchedMedicId || defaultMedicId;
    if (!open || !medicId) {
      setMedicPreferences([]);
      setMedicBlockDays([]);
      return;
    }

    async function loadAvailability() {
      try {
        const res = await fetch(`/api/preferences?userId=${medicId}`);
        if (res.ok) {
          const json = await res.json();
          setMedicPreferences(json.data?.preferences ?? []);
          setMedicBlockDays(json.data?.blockDays ?? []);
        }
      } catch {
        // Non-critical
      }
    }
    loadAvailability();
  }, [open, watchedMedicId, defaultMedicId]);

  // Compute validation warnings
  const availabilityWarnings: { type: "error" | "warning"; message: string }[] = [];

  if (watchedDate && watchedDate.length === 10) {
    const selectedDate = new Date(watchedDate + "T12:00:00");
    if (isNaN(selectedDate.getTime())) {
      // Invalid date, skip validation
    } else {
    const dayOfWeek = selectedDate.getDay();
    const dateStr = watchedDate; // YYYY-MM-DD

    // Check blocked day
    const isBlocked = medicBlockDays.some((b) => {
      const bDate = new Date(b.date);
      const bStr = `${bDate.getFullYear()}-${String(bDate.getMonth() + 1).padStart(2, "0")}-${String(bDate.getDate()).padStart(2, "0")}`;
      return bStr === dateStr;
    });

    if (isBlocked) {
      availabilityWarnings.push({
        type: "error",
        message: "Este dia esta bloqueado para el medico seleccionado",
      });
    }

    // Check non-working day
    const pref = medicPreferences.find((p) => p.day === dayOfWeek);
    const hasAnySlot = pref && (
      (pref.fromHourAM && pref.toHourAM) ||
      (pref.fromHourPM && pref.toHourPM)
    );

    if (medicPreferences.length > 0 && !hasAnySlot) {
      const dayName = DAY_NAMES[dayOfWeek] ?? "este dia";
      availabilityWarnings.push({
        type: "error",
        message: `El medico no atiende los ${dayName.toLowerCase()}`,
      });
    }

    // Check work hours
    if (hasAnySlot && watchedStartTime && watchedEndTime) {
      let withinSlot = false;

      if (pref?.fromHourAM && pref?.toHourAM) {
        if (watchedStartTime >= pref.fromHourAM && watchedEndTime <= pref.toHourAM) {
          withinSlot = true;
        }
      }
      if (!withinSlot && pref?.fromHourPM && pref?.toHourPM) {
        if (watchedStartTime >= pref.fromHourPM && watchedEndTime <= pref.toHourPM) {
          withinSlot = true;
        }
      }

      if (!withinSlot) {
        const parts: string[] = [];
        if (pref?.fromHourAM && pref?.toHourAM) parts.push(`${pref.fromHourAM} - ${pref.toHourAM}`);
        if (pref?.fromHourPM && pref?.toHourPM) parts.push(`${pref.fromHourPM} - ${pref.toHourPM}`);
        availabilityWarnings.push({
          type: "warning",
          message: `Fuera del horario de atencion (${parts.join(", ")})`,
        });
      }
    }
    } // close else (valid date)
  }

  const hasErrors = availabilityWarnings.some((w) => w.type === "error");

  const filteredPatients = patients.filter((p) => {
    const search = patientSearch.toLowerCase();
    return (
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(search) ||
      (p.dni?.toLowerCase().includes(search) ?? false)
    );
  });

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  // Overbook conflict state
  const [conflictInfo, setConflictInfo] = useState<{
    message: string;
    pendingBody: Record<string, unknown>;
  } | null>(null);

  async function createShift(body: Record<string, unknown>) {
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // If conflict, offer overbook
      if (err.code === "SHIFT_CONFLICT") {
        setConflictInfo({
          message: err.error,
          pendingBody: body,
        });
        return;
      }
      throw new Error(err.error ?? "Error al crear el turno");
    }

    const isOverbook = (body.isOverbook as boolean) ?? false;
    toast.success(isOverbook ? "Sobreturno creado exitosamente" : "Turno creado exitosamente");
    setConflictInfo(null);
    onCreated();
  }

  async function onSubmit(data: CreateShiftForm) {
    try {
      const startDatetime = new Date(`${data.date}T${data.startTime}:00`);
      const endDatetime = new Date(`${data.date}T${data.endTime}:00`);

      if (endDatetime <= startDatetime) {
        toast.error("La hora de fin debe ser posterior a la hora de inicio");
        return;
      }

      const body: Record<string, unknown> = {
        patientId: data.patientId,
        start: startDatetime.toISOString(),
        end: endDatetime.toISOString(),
      };

      if (data.medicId) {
        body.userId = data.medicId;
      }

      await createShift(body);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear el turno"
      );
    }
  }

  async function confirmOverbook() {
    if (!conflictInfo) return;
    try {
      await createShift({ ...conflictInfo.pendingBody, isOverbook: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear sobreturno"
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo Turno</DialogTitle>
          <DialogDescription>
            Completa los datos para crear un nuevo turno.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Patient selector */}
          <div className="space-y-2">
            <Label>Paciente</Label>
            <Popover
              open={patientPopoverOpen}
              onOpenChange={setPatientPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedPatient
                    ? `${selectedPatient.lastName}, ${selectedPatient.firstName}`
                    : "Seleccionar paciente..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar por nombre o DNI..."
                    value={patientSearch}
                    onValueChange={setPatientSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {loadingPatients
                        ? "Cargando..."
                        : "No se encontraron pacientes."}
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredPatients.slice(0, 50).map((patient) => (
                        <CommandItem
                          key={patient.id}
                          value={`${patient.lastName} ${patient.firstName} ${patient.dni ?? ""}`}
                          onSelect={() => {
                            setValue("patientId", patient.id);
                            setPatientPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedPatientId === patient.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div>
                            <span className="font-medium">
                              {patient.lastName}, {patient.firstName}
                            </span>
                            {patient.dni && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                DNI: {patient.dni}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.patientId && (
              <p className="text-sm text-destructive">
                {errors.patientId.message}
              </p>
            )}
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">Fecha</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="date"
                type="date"
                className="pl-10"
                {...register("date")}
              />
            </div>
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date.message}</p>
            )}
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Hora inicio</Label>
              <Input
                id="startTime"
                type="time"
                {...register("startTime")}
              />
              {errors.startTime && (
                <p className="text-sm text-destructive">
                  {errors.startTime.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Hora fin</Label>
              <Input id="endTime" type="time" {...register("endTime")} />
              {errors.endTime && (
                <p className="text-sm text-destructive">
                  {errors.endTime.message}
                </p>
              )}
            </div>
          </div>

          {/* Availability warnings */}
          {availabilityWarnings.length > 0 && (
            <div className="space-y-2">
              {availabilityWarnings.map((w, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    w.type === "error"
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : "border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  )}
                >
                  {w.type === "error" ? (
                    <Ban className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  {w.message}
                </div>
              ))}
            </div>
          )}

          {/* Medic (optional) */}
          {medics.length > 0 && (
            <div className="space-y-2">
              <Label>Médico</Label>
              <Select
                onValueChange={(val) => setValue("medicId", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar médico (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {medics.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name ??
                        `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() ??
                        "Sin nombre"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Overbook conflict prompt */}
          {conflictInfo && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-3 space-y-2 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Conflicto de horario
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {conflictInfo.message}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConflictInfo(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={confirmOverbook}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear como sobreturno
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || hasErrors || !!conflictInfo}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear Turno
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
