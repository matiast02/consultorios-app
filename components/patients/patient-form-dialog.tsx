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
import { Loader2, CalendarIcon, Plus, X } from "lucide-react";
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

  // Additional insurances (multi-OS)
  interface AdditionalInsurance {
    healthInsuranceId: string;
    affiliateNumber: string;
    healthInsurance?: HealthInsurance;
  }
  const [additionalInsurances, setAdditionalInsurances] = useState<AdditionalInsurance[]>([]);
  const [showAddInsurance, setShowAddInsurance] = useState(false);
  const [newInsuranceId, setNewInsuranceId] = useState("");
  const [newAffiliateNumber, setNewAffiliateNumber] = useState("");

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
        // Load existing additional insurances
        async function loadPatientInsurances() {
          try {
            const res = await fetch(`/api/patients/${patient!.id}/insurances`);
            if (res.ok) {
              const json = await res.json();
              const list = json.data ?? [];
              setAdditionalInsurances(
                list.map((pi: { healthInsuranceId: string; affiliateNumber?: string; healthInsurance?: HealthInsurance }) => ({
                  healthInsuranceId: pi.healthInsuranceId,
                  affiliateNumber: pi.affiliateNumber ?? "",
                  healthInsurance: pi.healthInsurance,
                }))
              );
            }
          } catch {
            // Non-critical
          }
        }
        loadPatientInsurances();
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
        setAdditionalInsurances([]);
      }
      setShowAddInsurance(false);
      setNewInsuranceId("");
      setNewAffiliateNumber("");
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

  function addAdditionalInsurance() {
    if (!newInsuranceId) return;

    // Don't add duplicates (also check against main OS)
    const mainOsId = watch("osId");
    if (newInsuranceId === mainOsId) {
      toast.error("Esta obra social ya esta asignada como principal");
      return;
    }
    if (additionalInsurances.some((ai) => ai.healthInsuranceId === newInsuranceId)) {
      toast.error("Esta obra social ya fue agregada");
      return;
    }

    const ins = healthInsurances.find((hi) => hi.id === newInsuranceId);
    setAdditionalInsurances((prev) => [
      ...prev,
      {
        healthInsuranceId: newInsuranceId,
        affiliateNumber: newAffiliateNumber,
        healthInsurance: ins,
      },
    ]);
    setNewInsuranceId("");
    setNewAffiliateNumber("");
    setShowAddInsurance(false);
  }

  function removeAdditionalInsurance(healthInsuranceId: string) {
    setAdditionalInsurances((prev) =>
      prev.filter((ai) => ai.healthInsuranceId !== healthInsuranceId)
    );
  }

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

      const resJson = await res.json();
      const patientId = isEdit ? patient.id : resJson.data?.id;

      // Save additional insurances if we have a patient ID
      if (patientId) {
        // Fetch current insurances to diff
        let currentInsurances: { healthInsuranceId: string }[] = [];
        if (isEdit) {
          try {
            const curRes = await fetch(`/api/patients/${patientId}/insurances`);
            if (curRes.ok) {
              const curJson = await curRes.json();
              currentInsurances = curJson.data ?? [];
            }
          } catch {
            // Continue
          }
        }

        const currentIds = new Set(currentInsurances.map((ci) => ci.healthInsuranceId));
        const desiredIds = new Set(additionalInsurances.map((ai) => ai.healthInsuranceId));

        // Delete removed
        for (const id of currentIds) {
          if (!desiredIds.has(id)) {
            await fetch(`/api/patients/${patientId}/insurances`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ healthInsuranceId: id }),
            }).catch(() => {});
          }
        }

        // Add new
        for (const ai of additionalInsurances) {
          if (!currentIds.has(ai.healthInsuranceId)) {
            await fetch(`/api/patients/${patientId}/insurances`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                healthInsuranceId: ai.healthInsuranceId,
                affiliateNumber: ai.affiliateNumber || undefined,
              }),
            }).catch(() => {});
          }
        }
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

          {/* Health Insurance (principal) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Obra Social principal</Label>
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

          {/* Additional insurances (multi-OS) */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Obras Sociales adicionales</Label>

            {additionalInsurances.length > 0 && (
              <div className="space-y-2">
                {additionalInsurances.map((ai) => (
                  <div
                    key={ai.healthInsuranceId}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">
                        {ai.healthInsurance?.name ?? "Obra social"}
                      </span>
                      {ai.affiliateNumber && (
                        <span className="text-muted-foreground">
                          - N° {ai.affiliateNumber}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeAdditionalInsurance(ai.healthInsuranceId)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {showAddInsurance ? (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Obra Social</Label>
                    <Select
                      value={newInsuranceId || undefined}
                      onValueChange={setNewInsuranceId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {healthInsurances
                          .filter(
                            (os) =>
                              os.id !== selectedOsId &&
                              !additionalInsurances.some(
                                (ai) => ai.healthInsuranceId === os.id
                              )
                          )
                          .map((os) => (
                            <SelectItem key={os.id} value={os.id}>
                              {os.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">N° Afiliado</Label>
                    <Input
                      className="h-8 text-xs"
                      value={newAffiliateNumber}
                      onChange={(e) => setNewAffiliateNumber(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddInsurance(false);
                      setNewInsuranceId("");
                      setNewAffiliateNumber("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addAdditionalInsurance}
                    disabled={!newInsuranceId}
                  >
                    Agregar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddInsurance(true)}
              >
                <Plus className="mr-2 h-3 w-3" />
                Agregar obra social
              </Button>
            )}
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
