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
import { CalendarIcon, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient, Medic } from "@/types";

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

  const filteredPatients = patients.filter((p) => {
    const search = patientSearch.toLowerCase();
    return (
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(search) ||
      (p.dni?.toLowerCase().includes(search) ?? false)
    );
  });

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  async function onSubmit(data: CreateShiftForm) {
    try {
      const startDatetime = new Date(`${data.date}T${data.startTime}:00`);
      const endDatetime = new Date(`${data.date}T${data.endTime}:00`);

      if (endDatetime <= startDatetime) {
        toast.error("La hora de fin debe ser posterior a la hora de inicio");
        return;
      }

      const body: Record<string, string> = {
        patientId: data.patientId,
        start: startDatetime.toISOString(),
        end: endDatetime.toISOString(),
      };

      if (data.medicId) {
        body.userId = data.medicId;
      }

      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al crear el turno");
      }

      toast.success("Turno creado exitosamente");
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear el turno"
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
              Crear Turno
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
