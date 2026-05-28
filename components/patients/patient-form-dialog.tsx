"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
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
  Loader2,
  Plus,
  X,
  Check,
  ChevronLeft,
  Shield,
  Mail,
  CalendarIcon,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Patient, HealthInsurance } from "@/types";

// ─── Schema ─────────────────────────────────────────────────────────────────
const patientSchema = z.object({
  // Step 1 — Esencial (all required except sex which has 3 options)
  firstName: z.string().min(1, "El nombre es obligatorio"),
  lastName: z.string().min(1, "El apellido es obligatorio"),
  dni: z.string().min(1, "El DNI es obligatorio"),
  birthDate: z.string().min(1, "La fecha de nacimiento es obligatoria"),
  sex: z.enum(["M", "F", "X"], { required_error: "El sexo es obligatorio" }),
  telephone: z.string().min(1, "El teléfono es obligatorio"),
  // Step 2 — Cobertura y contacto (all optional)
  osId: z.string().optional(),
  osNumber: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional(),
  country: z.string().optional(),
  province: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  onSaved: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDniDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function unformatDni(raw: string): string {
  return raw.replace(/\D/g, "");
}

// ─── Component ──────────────────────────────────────────────────────────────
export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  onSaved,
}: PatientFormDialogProps) {
  const isEdit = !!patient;

  const [step, setStep] = useState<1 | 2>(1);
  const [healthInsurances, setHealthInsurances] = useState<HealthInsurance[]>([]);
  const [savingMinimal, setSavingMinimal] = useState(false);

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
    trigger,
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
      country: "Argentina",
      province: "",
      osId: "",
      osNumber: "",
    },
  });

  const selectedOsId = watch("osId");
  const selectedSex = watch("sex");
  const dniValue = watch("dni") ?? "";
  const birthDateValue = watch("birthDate") ?? "";

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
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
          country: patient.country ?? "Argentina",
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
                list.map(
                  (pi: {
                    healthInsuranceId: string;
                    affiliateNumber?: string;
                    healthInsurance?: HealthInsurance;
                  }) => ({
                    healthInsuranceId: pi.healthInsuranceId,
                    affiliateNumber: pi.affiliateNumber ?? "",
                    healthInsurance: pi.healthInsurance,
                  })
                )
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
          country: "Argentina",
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
    const mainOsId = watch("osId");
    if (newInsuranceId === mainOsId) {
      toast.error("Esta obra social ya está asignada como principal");
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

  // Submit handler — works for both step 1 (minimal) and step 2 (full)
  async function persist(data: PatientFormValues) {
    try {
      const url = isEdit ? `/api/patients/${patient.id}` : "/api/patients";
      const method = isEdit ? "PUT" : "POST";

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
        throw new Error(err.error ?? `Error al ${isEdit ? "actualizar" : "crear"} el paciente`);
      }

      const resJson = await res.json();
      const patientId = isEdit ? patient.id : resJson.data?.id;

      if (patientId && additionalInsurances.length > 0) {
        let currentInsurances: { healthInsuranceId: string }[] = [];
        if (isEdit) {
          try {
            const curRes = await fetch(`/api/patients/${patientId}/insurances`);
            if (curRes.ok) {
              const curJson = await curRes.json();
              currentInsurances = curJson.data ?? [];
            }
          } catch {
            // continue
          }
        }
        const currentIds = new Set(currentInsurances.map((ci) => ci.healthInsuranceId));
        const desiredIds = new Set(additionalInsurances.map((ai) => ai.healthInsuranceId));
        for (const id of currentIds) {
          if (!desiredIds.has(id)) {
            await fetch(`/api/patients/${patientId}/insurances`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ healthInsuranceId: id }),
            }).catch(() => {});
          }
        }
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

      toast.success(`Paciente ${isEdit ? "actualizado" : "creado"} exitosamente`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
      throw error;
    }
  }

  // Step 1 → Step 2 (validate step 1 first)
  async function handleContinue() {
    const valid = await trigger([
      "firstName",
      "lastName",
      "dni",
      "birthDate",
      "sex",
      "telephone",
    ]);
    if (valid) setStep(2);
  }

  // "Crear con datos mínimos" — skip step 2
  async function handleCreateMinimal() {
    const valid = await trigger([
      "firstName",
      "lastName",
      "dni",
      "birthDate",
      "sex",
      "telephone",
    ]);
    if (!valid) return;
    setSavingMinimal(true);
    try {
      const data = watch();
      await persist({
        ...data,
        osId: "",
        osNumber: "",
        email: "",
        address: "",
      });
    } catch {
      // toast already shown
    } finally {
      setSavingMinimal(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-[560px]"
        // Remove default close button to avoid duplicate with our header X
      >
        <form onSubmit={handleSubmit(persist)}>
          {/* ─── Header ────────────────────────────────────────────────── */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  {step === 1
                    ? isEdit
                      ? "Editar paciente"
                      : "Nuevo paciente"
                    : "Cobertura y contacto"}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                  {step === 1
                    ? "Paso 1 de 2 · Datos para identificar y contactar."
                    : "Paso 2 de 2 · Podés saltarlo y completar después."}
                </DialogDescription>
              </div>
            </div>

            {/* Stepper */}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold",
                    step === 1
                      ? "bg-primary text-primary-foreground"
                      : "bg-emerald-500 text-white"
                  )}
                >
                  {step === 1 ? "1" : <Check className="h-3.5 w-3.5" />}
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    step === 1 ? "text-foreground" : "text-emerald-600"
                  )}
                >
                  Esencial
                </span>
              </div>
              <div
                className={cn(
                  "h-px flex-1",
                  step === 2 ? "bg-emerald-500" : "bg-border"
                )}
              />
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold",
                    step === 2
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-muted text-muted-foreground"
                  )}
                >
                  2
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    step === 2 ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  Cobertura
                </span>
              </div>
            </div>
          </div>

          {/* ─── Step 1 — Esencial ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4 px-6 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs font-semibold">
                    Nombre <span className="text-rose-500">*</span>
                  </Label>
                  <Input id="firstName" placeholder="Camila" {...register("firstName")} />
                  {errors.firstName && (
                    <p className="text-xs text-rose-600">{errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs font-semibold">
                    Apellido <span className="text-rose-500">*</span>
                  </Label>
                  <Input id="lastName" placeholder="González" {...register("lastName")} />
                  {errors.lastName && (
                    <p className="text-xs text-rose-600">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dni" className="text-xs font-semibold">
                    DNI <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="dni"
                    placeholder="30.123.456"
                    value={formatDniDisplay(dniValue)}
                    onChange={(e) => setValue("dni", unformatDni(e.target.value), { shouldValidate: true })}
                    inputMode="numeric"
                  />
                  {errors.dni && <p className="text-xs text-rose-600">{errors.dni.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Fecha de nacimiento <span className="text-rose-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !birthDateValue && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {birthDateValue
                          ? format(parse(birthDateValue, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: es })
                          : "dd/mm/aaaa"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={birthDateValue ? parse(birthDateValue, "yyyy-MM-dd", new Date()) : undefined}
                        onSelect={(date) =>
                          setValue("birthDate", date ? format(date, "yyyy-MM-dd") : "", { shouldValidate: true })
                        }
                        defaultMonth={
                          birthDateValue
                            ? parse(birthDateValue, "yyyy-MM-dd", new Date())
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
                    <p className="text-xs text-rose-600">{errors.birthDate.message}</p>
                  )}
                </div>
              </div>

              {/* Sex segmented control */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Sexo <span className="text-rose-500">*</span>
                </Label>
                <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
                  {[
                    { value: "F", label: "Femenino" },
                    { value: "M", label: "Masculino" },
                    { value: "X", label: "Otro" },
                  ].map((opt) => {
                    const active = selectedSex === opt.value;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setValue("sex", opt.value as "M" | "F" | "X", { shouldValidate: true })}
                        className={cn(
                          "h-8 rounded-md text-xs font-medium transition",
                          active
                            ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {errors.sex && <p className="text-xs text-rose-600">{errors.sex.message}</p>}
              </div>

              {/* Phone with +54 prefix */}
              <div className="space-y-1.5">
                <Label htmlFor="telephone" className="text-xs font-semibold">
                  Teléfono <span className="text-rose-500">*</span>
                </Label>
                <div className="flex items-stretch overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring/30">
                  <span className="grid place-items-center border-r bg-muted/60 px-3 text-xs font-semibold text-muted-foreground">
                    +54
                  </span>
                  <Input
                    id="telephone"
                    placeholder="11 5634 1278"
                    className="border-0 focus-visible:ring-0"
                    {...register("telephone")}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Para recordatorios automáticos por WhatsApp.
                </p>
                {errors.telephone && (
                  <p className="text-xs text-rose-600">{errors.telephone.message}</p>
                )}
              </div>
            </div>
          )}

          {/* ─── Step 2 — Cobertura y contacto ──────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5 px-6 pb-4">
              {/* COBERTURA */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" />
                  Cobertura
                </div>
                <div className="grid grid-cols-[1fr_1fr] gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Obra social <span className="text-rose-500">*</span>
                    </Label>
                    <Select
                      value={selectedOsId || ""}
                      onValueChange={(val) => setValue("osId", val === "none" ? "" : val)}
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
                  <div className="space-y-1.5">
                    <Label htmlFor="osNumber" className="text-xs font-semibold">
                      N° de afiliado{" "}
                      <span className="text-muted-foreground/70">(opcional)</span>
                    </Label>
                    <Input id="osNumber" placeholder="623-4789-01" {...register("osNumber")} />
                  </div>
                </div>

                {/* Additional insurances */}
                {additionalInsurances.length > 0 && (
                  <div className="space-y-2">
                    {additionalInsurances.map((ai) => (
                      <div
                        key={ai.healthInsuranceId}
                        className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">
                            {ai.healthInsurance?.name ?? "Obra social"}
                          </span>
                          {ai.affiliateNumber && (
                            <span className="text-xs text-muted-foreground">
                              · N° {ai.affiliateNumber}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                          onClick={() => removeAdditionalInsurance(ai.healthInsuranceId)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddInsurance ? (
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={newInsuranceId || undefined} onValueChange={setNewInsuranceId}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {healthInsurances
                            .filter(
                              (os) =>
                                os.id !== selectedOsId &&
                                !additionalInsurances.some((ai) => ai.healthInsuranceId === os.id)
                            )
                            .map((os) => (
                              <SelectItem key={os.id} value={os.id}>
                                {os.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 text-xs"
                        value={newAffiliateNumber}
                        onChange={(e) => setNewAffiliateNumber(e.target.value)}
                        placeholder="N° de afiliado (opcional)"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
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
                  <button
                    type="button"
                    onClick={() => setShowAddInsurance(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar otra cobertura
                  </button>
                )}
              </div>

              {/* CONTACTO ADICIONAL */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Contacto adicional
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">
                    Email{" "}
                    <span className="text-muted-foreground/70">(opcional)</span>
                  </Label>
                  <Input id="email" type="email" placeholder="camila@email.com" {...register("email")} />
                  {errors.email && (
                    <p className="text-xs text-rose-600">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-xs font-semibold">
                    Dirección{" "}
                    <span className="text-muted-foreground/70">(opcional)</span>
                  </Label>
                  <Input id="address" placeholder="Av. Santa Fe 1234, CABA" {...register("address")} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Footer ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-6 py-3">
            {step === 1 ? (
              <button
                type="button"
                onClick={handleCreateMinimal}
                disabled={savingMinimal || isSubmitting}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {savingMinimal && <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />}
                Crear con datos mínimos
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Atrás
              </button>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              {step === 1 ? (
                <Button type="button" size="sm" onClick={handleContinue}>
                  Continuar
                  <ChevronLeft className="ml-1 h-3.5 w-3.5 rotate-180" />
                </Button>
              ) : (
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  )}
                  {isEdit ? "Guardar cambios" : "Crear paciente"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
