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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, CalendarIcon, Check, ChevronsUpDown, Loader2, Ban, Repeat, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient, Medic, UserPreference, BlockDay, ConsultationType, HealthInsurance } from "@/types";
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
        const res = await fetch("/api/patients?limit=100");
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

  // ─── Consultation types ────────────────────────────────────────────────────
  const [consultationTypes, setConsultationTypes] = useState<ConsultationType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    async function loadTypes() {
      try {
        const res = await fetch("/api/consultation-types");
        if (res.ok) {
          const json = await res.json();
          const list: ConsultationType[] = json.data ?? [];
          setConsultationTypes(list);
          // Auto-select default type
          const def = list.find((t) => t.isDefault);
          if (def) setSelectedTypeId(def.id);
        }
      } catch { /* non-critical */ }
    }
    loadTypes();
  }, [open]);

  // Auto-calculate endTime when consultation type or startTime changes
  useEffect(() => {
    if (!selectedTypeId) return;
    const ct = consultationTypes.find((t) => t.id === selectedTypeId);
    const currentStart = watch("startTime");
    if (ct && currentStart) {
      const [h, m] = currentStart.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const totalMin = h * 60 + m + ct.durationMinutes;
        const endH = Math.floor(totalMin / 60);
        const endM = totalMin % 60;
        if (endH < 24) {
          setValue("endTime", `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
        }
      }
    }
  }, [selectedTypeId, watch("startTime")]);

  // ─── Available slots ───────────────────────────────────────────────────────
  interface TimeSlot { start: string; end: string; available: boolean }
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [slotsMessage, setSlotsMessage] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Fetch slots when medic + date + duration change
  useEffect(() => {
    const medicId = watch("medicId") || defaultMedicId;
    const date = watch("date");
    const ct = consultationTypes.find((t) => t.id === selectedTypeId);
    const duration = ct?.durationMinutes ?? 30;

    if (!open || !medicId || !date || date.length !== 10) {
      setAvailableSlots([]);
      setSlotsMessage("");
      return;
    }

    async function fetchSlots() {
      setLoadingSlots(true);
      try {
        const res = await fetch(`/api/users/${medicId}/available-slots?date=${date}&duration=${duration}`);
        if (res.ok) {
          const json = await res.json();
          setAvailableSlots(json.data?.slots ?? []);
          setSlotsMessage(json.data?.message ?? "");
        }
      } catch { /* non-critical */ }
      finally { setLoadingSlots(false); }
    }
    fetchSlots();
  }, [open, watch("medicId"), defaultMedicId, watch("date"), selectedTypeId, consultationTypes]);

  function selectSlot(slot: TimeSlot) {
    if (!slot.available) return;
    setValue("startTime", slot.start);
    setValue("endTime", slot.end);
  }

  const selectedStartTime = watch("startTime");

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

  // ─── Insurance mismatch check ──────────────────────────────────────────────
  const [medicInsuranceIds, setMedicInsuranceIds] = useState<string[]>([]);
  const [patientInsuranceIds, setPatientInsuranceIds] = useState<string[]>([]);

  // Fetch medic's accepted insurances
  useEffect(() => {
    const medicId = watchedMedicId || defaultMedicId;
    if (!open || !medicId) {
      setMedicInsuranceIds([]);
      return;
    }
    async function loadMedicInsurances() {
      try {
        const res = await fetch(`/api/users/${medicId}/insurances`);
        if (res.ok) {
          const json = await res.json();
          const list: HealthInsurance[] = json.data ?? [];
          setMedicInsuranceIds(list.map((ins) => ins.id));
        }
      } catch { /* non-critical */ }
    }
    loadMedicInsurances();
  }, [open, watchedMedicId, defaultMedicId]);

  // Fetch patient's insurances (legacy osId + additional)
  useEffect(() => {
    if (!open || !selectedPatientId) {
      setPatientInsuranceIds([]);
      return;
    }
    const pat = patients.find((p) => p.id === selectedPatientId);
    const ids: string[] = [];
    if (pat?.osId) ids.push(pat.osId);

    async function loadPatientInsurances() {
      try {
        const res = await fetch(`/api/patients/${selectedPatientId}/insurances`);
        if (res.ok) {
          const json = await res.json();
          const list = json.data ?? [];
          for (const pi of list) {
            if (pi.healthInsuranceId && !ids.includes(pi.healthInsuranceId)) {
              ids.push(pi.healthInsuranceId);
            }
          }
        }
      } catch { /* non-critical */ }
      setPatientInsuranceIds([...ids]);
    }
    loadPatientInsurances();
  }, [open, selectedPatientId, patients]);

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
        message: "Este dia esta bloqueado para el profesional seleccionado",
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
        message: `El profesional no atiende los ${dayName.toLowerCase()}`,
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

  // Insurance mismatch warning
  const medicId = watchedMedicId || defaultMedicId;
  if (medicId && selectedPatientId && medicInsuranceIds.length > 0) {
    const hasMatch = patientInsuranceIds.some((id) => medicInsuranceIds.includes(id));
    if (!hasMatch) {
      availabilityWarnings.push({
        type: "warning",
        message: "Este profesional no acepta la obra social del paciente. Se atendera como particular.",
      });
    }
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

  // Recurring shift state
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequencyWeeks, setFrequencyWeeks] = useState("2");
  const [recurringCount, setRecurringCount] = useState("4");

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

    const resJson = await res.json().catch(() => ({}));

    // Show insurance mismatch warning from backend
    if (resJson.warning?.code === "INSURANCE_MISMATCH") {
      toast.warning(resJson.warning.message);
    }

    const isOverbook = (body.isOverbook as boolean) ?? false;
    toast.success(isOverbook ? "Sobreturno creado exitosamente" : "Turno creado exitosamente");
    setConflictInfo(null);
    onCreated();
  }

  async function onSubmit(data: CreateShiftForm) {
    try {
      if (data.endTime <= data.startTime) {
        toast.error("La hora de fin debe ser posterior a la hora de inicio");
        return;
      }

      // Recurring mode — use the recurring API
      if (isRecurring) {
        const recurBody: Record<string, unknown> = {
          patientId: data.patientId,
          userId: data.medicId || undefined,
          startDate: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          frequencyWeeks: parseInt(frequencyWeeks),
          count: parseInt(recurringCount),
        };
        if (selectedTypeId) recurBody.consultationTypeId = selectedTypeId;

        const res = await fetch("/api/shifts/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recurBody),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al crear turnos recurrentes");
        }

        const json = await res.json();
        const created = json.data?.created?.length ?? 0;
        const skipped = json.data?.skipped?.length ?? 0;

        if (skipped > 0) {
          toast.success(`Se crearon ${created} turnos. ${skipped} omitido(s) por conflictos.`);
        } else {
          toast.success(`Se crearon ${created} turnos recurrentes`);
        }
        onCreated();
        return;
      }

      // Single shift mode
      const startDatetime = new Date(`${data.date}T${data.startTime}:00`);
      const endDatetime = new Date(`${data.date}T${data.endTime}:00`);

      const body: Record<string, unknown> = {
        patientId: data.patientId,
        start: startDatetime.toISOString(),
        end: endDatetime.toISOString(),
      };

      if (data.medicId) body.userId = data.medicId;
      if (selectedTypeId) body.consultationTypeId = selectedTypeId;

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
            <Label>Fecha</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !watch("date") && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {watch("date")
                    ? format(
                        parse(watch("date"), "yyyy-MM-dd", new Date()),
                        "EEEE, d 'de' MMMM yyyy",
                        { locale: es }
                      )
                    : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={
                    watch("date")
                      ? parse(watch("date"), "yyyy-MM-dd", new Date())
                      : undefined
                  }
                  onSelect={(date) =>
                    setValue("date", date ? format(date, "yyyy-MM-dd") : "")
                  }
                  locale={es}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date.message}</p>
            )}
          </div>

          {/* Consultation Type */}
          {consultationTypes.length > 0 && (
            <div className="space-y-2">
              <Label>Tipo de consulta</Label>
              <Select
                value={selectedTypeId || "__none__"}
                onValueChange={(v) => setSelectedTypeId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin tipo</SelectItem>
                  {consultationTypes.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>
                      <div className="flex items-center gap-2">
                        {ct.color && (
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ct.color }}
                          />
                        )}
                        {ct.name}
                        <span className="text-muted-foreground">({ct.durationMinutes} min)</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time slots */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Horario
            </Label>

            {/* Slot grid when medic is selected */}
            {(watch("medicId") || defaultMedicId) && watch("date") ? (
              loadingSlots ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Cargando horarios...</span>
                </div>
              ) : slotsMessage ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {slotsMessage}
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => selectSlot(slot)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        slot.available
                          ? selectedStartTime === slot.start
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          : "border-muted bg-muted/30 text-muted-foreground/50 line-through cursor-not-allowed"
                      )}
                    >
                      {slot.start}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  No hay horarios configurados para este dia
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                Selecciona un profesional y una fecha para ver los horarios disponibles
              </p>
            )}

            {/* Hidden inputs for form */}
            <input type="hidden" {...register("startTime")} />
            <input type="hidden" {...register("endTime")} />
            {errors.startTime && (
              <p className="text-sm text-destructive">{errors.startTime.message}</p>
            )}
          </div>

          {/* Recurring toggle */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium cursor-pointer">
                    Repetir turno
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 pl-6">
                  Programa varios turnos automaticamente con la misma frecuencia
                </p>
              </div>
              <Switch
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
              />
            </div>
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Frecuencia</Label>
                  <Select value={frequencyWeeks} onValueChange={setFrequencyWeeks}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Cada semana</SelectItem>
                      <SelectItem value="2">Cada 2 semanas</SelectItem>
                      <SelectItem value="3">Cada 3 semanas</SelectItem>
                      <SelectItem value="4">Cada mes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cantidad</Label>
                  <Select value={recurringCount} onValueChange={setRecurringCount}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 11 }, (_, i) => (
                        <SelectItem key={i + 2} value={String(i + 2)}>
                          {i + 2} turnos
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
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

          {/* Profesional (optional) */}
          {medics.length > 0 && (
            <div className="space-y-2">
              <Label>Profesional</Label>
              <Select
                onValueChange={(val) => setValue("medicId", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar profesional (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {medics.map((m) => {
                    const displayName = m.name ??
                      `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() ??
                      "Sin nombre";
                    const profName = m.specialization?.professionConfig?.name;
                    const specName = m.specialization?.name;
                    // Show: specialization if medic profession, else profession name
                    const subtitle = profName && profName !== "Médico" && profName !== "Profesional"
                      ? profName  // "Dentista", "Nutricionista", "Psicólogo"
                      : specName ?? null; // "Medicina General", "Pediatría"
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        <div>
                          <span>{displayName}</span>
                          {subtitle && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {subtitle}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
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
              {isRecurring ? `Crear ${recurringCount} Turnos` : "Crear Turno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
