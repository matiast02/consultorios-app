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
import { Loader2, CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import type { Patient, HealthInsurance } from "@/types";

const patientSchema = z.object({
  firstName: z.string().min(1, "El nombre es obligatorio"),
  lastName: z.string().min(1, "El apellido es obligatorio"),
  birthDate: z.string().min(1, "La fecha de nacimiento es obligatoria"),
  sex: z.enum(["M", "F", "X"], { required_error: "El sexo es obligatorio" }),
  dni: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telephone: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  province: z.string().optional(),
  osId: z.string().optional(),
  osNumber: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  onSaved: () => void;
}

export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  onSaved,
}: PatientFormDialogProps) {
  const isEdit = !!patient;
  const [healthInsurances, setHealthInsurances] = useState<HealthInsurance[]>(
    []
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      birthDate: "",
      sex: undefined,
      dni: "",
      email: "",
      telephone: "",
      address: "",
      country: "",
      province: "",
      osId: "",
      osNumber: "",
    },
  });

  const selectedOsId = watch("osId");
  const selectedSex = watch("sex");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (patient) {
        reset({
          firstName: patient.firstName,
          lastName: patient.lastName,
          birthDate: patient.birthDate
            ? new Date(patient.birthDate).toISOString().split("T")[0]
            : "",
          sex: (patient.sex as "M" | "F" | "X") ?? undefined,
          dni: patient.dni ?? "",
          email: patient.email ?? "",
          telephone: patient.telephone ?? "",
          address: patient.address ?? "",
          country: patient.country ?? "",
          province: patient.province ?? "",
          osId: patient.osId ?? "",
          osNumber: patient.osNumber ?? "",
        });
      } else {
        reset({
          firstName: "",
          lastName: "",
          birthDate: "",
          sex: undefined,
          dni: "",
          email: "",
          telephone: "",
          address: "",
          country: "",
          province: "",
          osId: "",
          osNumber: "",
        });
      }
    }
  }, [open, patient, reset]);

  // Fetch health insurances
  useEffect(() => {
    if (!open) return;
    async function loadInsurances() {
      try {
        const res = await fetch("/api/health-insurance");
        if (res.ok) {
          const json = await res.json();
          const list = json.data ?? [];
          setHealthInsurances(Array.isArray(list) ? list : []);
        }
      } catch {
        // Non-critical
      }
    }
    loadInsurances();
  }, [open]);

  async function onSubmit(data: PatientFormValues) {
    try {
      const url = isEdit ? `/api/patients/${patient.id}` : "/api/patients";
      const method = isEdit ? "PUT" : "POST";

      // Clean empty strings to undefined
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        body[key] = value === "" ? undefined : value;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ?? `Error al ${isEdit ? "actualizar" : "crear"} el paciente`
        );
      }

      toast.success(
        `Paciente ${isEdit ? "actualizado" : "creado"} exitosamente`
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar Paciente" : "Nuevo Paciente"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos del paciente."
              : "Completa los datos para registrar un nuevo paciente."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombre *</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellido *</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Sex & DNI */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sexo *</Label>
              <Select
                value={selectedSex ?? ""}
                onValueChange={(v) => setValue("sex", v as "M" | "F" | "X")}
              >
                <SelectTrigger className={!selectedSex ? "text-muted-foreground" : ""}>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                  <SelectItem value="X">Otro</SelectItem>
                </SelectContent>
              </Select>
              {errors.sex && (
                <p className="text-sm text-destructive">{errors.sex.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dni">DNI</Label>
              <Input id="dni" {...register("dni")} />
            </div>
          </div>

          {/* Birth date */}
          <div className="space-y-2">
              <Label>Fecha de nacimiento *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={`w-full justify-start text-left font-normal ${
                      !watch("birthDate") ? "text-muted-foreground" : ""
                    }`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watch("birthDate")
                      ? format(
                          parse(watch("birthDate")!, "yyyy-MM-dd", new Date()),
                          "dd/MM/yyyy",
                          { locale: es }
                        )
                      : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      watch("birthDate")
                        ? parse(watch("birthDate")!, "yyyy-MM-dd", new Date())
                        : undefined
                    }
                    onSelect={(date) =>
                      setValue(
                        "birthDate",
                        date ? format(date, "yyyy-MM-dd") : ""
                      )
                    }
                    defaultMonth={
                      watch("birthDate")
                        ? parse(watch("birthDate")!, "yyyy-MM-dd", new Date())
                        : new Date(1990, 0, 1)
                    }
                    captionLayout="dropdown"
                    fromYear={1920}
                    toYear={new Date().getFullYear()}
                    locale={es}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
              {errors.birthDate && (
                <p className="text-sm text-destructive">{errors.birthDate.message}</p>
              )}
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telephone">Teléfono</Label>
              <Input id="telephone" {...register("telephone")} />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" {...register("address")} />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <Input
                id="country"
                {...register("country")}
                placeholder="Argentina"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Provincia</Label>
              <Input id="province" {...register("province")} />
            </div>
          </div>

          {/* Health Insurance */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Obra Social</Label>
              <Select
                value={selectedOsId ?? ""}
                onValueChange={(val) =>
                  setValue("osId", val === "none" ? "" : val)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin obra social</SelectItem>
                  {healthInsurances.map((os) => (
                    <SelectItem key={os.id} value={os.id}>
                      {os.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="osNumber">N° Afiliado</Label>
              <Input id="osNumber" {...register("osNumber")} />
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
              {isEdit ? "Guardar cambios" : "Crear Paciente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
