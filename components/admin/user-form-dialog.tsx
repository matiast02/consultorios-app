"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  CalendarDays,
  Eye,
  EyeOff,
  Check,
  X,
  Stethoscope,
  CheckCircle2,
  Circle,
  Lock,
} from "lucide-react";
import { ScheduleSetupWizard } from "@/components/schedule-setup-wizard";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserWithRoles {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  specialization?: { id: string; name: string; color?: string | null } | null;
  roles: { id: string; name: string }[];
}

interface SpecializationOption {
  id: string;
  name: string;
  color?: string | null;
  professionConfigId?: string | null;
}

interface ProfessionConfigOption {
  id: string;
  code: string;
  name: string;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const formSchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  firstName: z.string().min(2, "El nombre es obligatorio"),
  lastName: z.string().min(2, "El apellido es obligatorio"),
  licenseNumber: z.string().optional(),
  professionConfigId: z.string().optional(),
  specializationId: z.string().optional(),
  role: z.string().min(1, "El rol es obligatorio"),
  changePassword: z.boolean().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────

const NO_SPECIALIZATION = "__none__";
const NO_PROFESSION = "__none__";

// ─── Password Strength ─────────────────────────────────────────────────────

const STRENGTH_LEVELS = [
  { label: "", bar: "", text: "" },
  { label: "Débil", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  { label: "Regular", bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  { label: "Buena", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { label: "Fuerte", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
] as const;

function getPasswordChecks(password: string) {
  return [
    { label: "Mínimo 8 caracteres", met: password.length >= 8 },
    { label: "Una mayúscula", met: /[A-Z]/.test(password) },
    { label: "Un número", met: /[0-9]/.test(password) },
    { label: "Un símbolo", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function PasswordStrength({ password }: { password: string }) {
  const checks = getPasswordChecks(password);
  const score = checks.filter((c) => c.met).length;
  const level = STRENGTH_LEVELS[score];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < score ? level.bar : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Seguridad</span>
        {score > 0 && (
          <span className={`font-medium ${level.text}`}>{level.label}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-1.5 text-xs">
            {check.met ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            )}
            <span className={check.met ? "text-foreground" : "text-muted-foreground"}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Optional Label ────────────────────────────────────────────────────────

function OptionalLabel({ children }: { children: React.ReactNode }) {
  return (
    <span>
      {children}{" "}
      <span className="font-normal text-muted-foreground">(opcional)</span>
    </span>
  );
}

// ─── Role Pill ─────────────────────────────────────────────────────────────

function RolePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      <Stethoscope className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

// ─── Password Input ─────────────────────────────────────────────────────────

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShow(!show)}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserWithRoles | null;
  onSaved: () => void;
}

const ROLE_OPTIONS = [
  { value: "medic", label: "Profesional de salud" },
  { value: "secretary", label: "Secretaria" },
  { value: "admin", label: "Administrador" },
];

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  onSaved,
}: UserFormDialogProps) {
  const { data: session } = useSession();
  const requesterRole = (session?.user as { role?: string })?.role;
  const isRequesterSecretary = requesterRole === "secretary";
  const isAdmin = requesterRole === "admin";

  const isEdit = !!user;
  const [specializations, setSpecializations] = useState<SpecializationOption[]>([]);
  const [professionConfigs, setProfessionConfigs] = useState<ProfessionConfigOption[]>([]);
  const [loadingSpecs, setLoadingSpecs] = useState(false);
  const [showSchedulePrompt, setShowSchedulePrompt] = useState(false);
  const [createdMedicId, setCreatedMedicId] = useState<string | null>(null);
  const [createdMedicName, setCreatedMedicName] = useState<string | null>(null);
  const [showScheduleWizard, setShowScheduleWizard] = useState(false);
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      licenseNumber: "",
      professionConfigId: "",
      specializationId: "",
      role: "medic",
    },
  });

  const selectedRole = watch("role");
  const selectedProfessionConfigId = watch("professionConfigId");
  const selectedSpecializationId = watch("specializationId");
  const password = watch("password") ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";
  const isMedicRole = selectedRole === "medic";

  // Filtered specializations by selected profession
  const filteredSpecializations = selectedProfessionConfigId && selectedProfessionConfigId !== NO_PROFESSION
    ? specializations.filter((s) => s.professionConfigId === selectedProfessionConfigId)
    : specializations;

  // Fetch specializations and profession configs when dialog opens
  useEffect(() => {
    if (open) {
      setLoadingSpecs(true);
      Promise.all([
        fetch("/api/specializations").then((res) => res.json()),
        fetch("/api/profession-configs").then((res) => res.json()),
      ])
        .then(([specsJson, profsJson]) => {
          setSpecializations(Array.isArray(specsJson.data) ? specsJson.data : []);
          setProfessionConfigs(Array.isArray(profsJson.data) ? profsJson.data : []);
        })
        .catch(() => {
          setSpecializations([]);
          setProfessionConfigs([]);
        })
        .finally(() => setLoadingSpecs(false));
    }
  }, [open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setShowRoleSelect(false);
      setShowAdvanced(false);
      setSendInvite(true);
      if (user) {
        const primaryRole = user.roles?.[0]?.name ?? "medic";
        // Find the profession config of the user's specialization
        const userSpecId = user.specialization?.id ?? "";
        reset({
          email: user.email ?? "",
          password: "",
          confirmPassword: "",
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          licenseNumber: ((user as unknown) as Record<string, unknown>).licenseNumber as string ?? "",
          professionConfigId: "", // will be set after specs load
          specializationId: userSpecId,
          role: isRequesterSecretary ? "medic" : primaryRole,
        });
      } else {
        reset({
          email: "",
          password: "",
          confirmPassword: "",
          firstName: "",
          lastName: "",
          specializationId: "",
          professionConfigId: "",
          role: "medic",
        });
      }
    }
  }, [open, user, reset, isRequesterSecretary]);

  // Set profession config from user's specialization once data loads
  useEffect(() => {
    if (isEdit && user?.specialization?.id && specializations.length > 0) {
      const userSpec = specializations.find((s) => s.id === user.specialization?.id);
      if (userSpec?.professionConfigId) {
        setValue("professionConfigId", userSpec.professionConfigId);
      }
    }
  }, [isEdit, user, specializations, setValue]);

  // Reset specialization when profession changes
  useEffect(() => {
    if (selectedProfessionConfigId) {
      const currentSpec = specializations.find((s) => s.id === selectedSpecializationId);
      if (currentSpec && currentSpec.professionConfigId !== selectedProfessionConfigId && selectedProfessionConfigId !== NO_PROFESSION) {
        setValue("specializationId", "");
      }
    }
  }, [selectedProfessionConfigId, selectedSpecializationId, specializations, setValue]);

  // Reset profession fields when role changes away from medic
  useEffect(() => {
    if (!isMedicRole) {
      setValue("professionConfigId", "");
      setValue("specializationId", "");
      setValue("licenseNumber", "");
    }
  }, [isMedicRole, setValue]);

  // Password validation helper
  function validatePassword(pw: string, confirm: string): string | null {
    if (!pw || pw.length < 8) return "La contrasena debe tener al menos 8 caracteres";
    if (!/[A-Z]/.test(pw)) return "La contrasena debe contener al menos una mayuscula";
    if (!/[0-9]/.test(pw)) return "La contrasena debe contener al menos un numero";
    if (pw !== confirm) return "Las contrasenas no coinciden";
    return null;
  }

  async function onSubmit(data: FormValues) {
    try {
      const specializationId =
        data.specializationId && data.specializationId !== NO_SPECIALIZATION
          ? data.specializationId
          : null;

      const fullName = `${data.firstName} ${data.lastName}`.trim();

      if (isEdit) {
        // Update user data
        const res = await fetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fullName,
            firstName: data.firstName || null,
            lastName: data.lastName || null,
            licenseNumber: isMedicRole ? (data.licenseNumber || null) : null,
            specializationId: isMedicRole ? specializationId : null,
            role: isRequesterSecretary ? undefined : data.role,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al actualizar usuario");
        }

        // Reset password if requested
        if (data.changePassword && data.password) {
          const pwError = validatePassword(data.password, data.confirmPassword ?? "");
          if (pwError) {
            toast.error(pwError);
            return;
          }

          const pwRes = await fetch(`/api/users/${user.id}/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newPassword: data.password }),
          });

          if (!pwRes.ok) {
            const err = await pwRes.json().catch(() => ({}));
            throw new Error(err.error ?? "Error al restablecer contrasena");
          }

          toast.success("Usuario actualizado y contrasena restablecida");
        } else {
          toast.success("Usuario actualizado exitosamente");
        }
      } else {
        // Create mode - validate required fields
        if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
          toast.error("Ingresa un email valido");
          return;
        }
        const pwError = validatePassword(data.password ?? "", data.confirmPassword ?? "");
        if (pwError) {
          toast.error(pwError);
          return;
        }

        // Create user via register
        const registerRes = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fullName,
            email: data.email,
            password: data.password,
          }),
        });

        if (!registerRes.ok) {
          const err = await registerRes.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al crear usuario");
        }

        const registerJson = await registerRes.json();
        const userId = registerJson.user?.id;

        // Update with additional fields
        if (userId) {
          const roleToAssign = isRequesterSecretary ? "medic" : data.role;
          await fetch(`/api/users/${userId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: fullName,
              firstName: data.firstName || null,
              lastName: data.lastName || null,
              licenseNumber: isMedicRole ? (data.licenseNumber || null) : null,
              specializationId: isMedicRole ? specializationId : null,
              role: roleToAssign,
            }),
          });
        }

        toast.success("Usuario creado exitosamente");

        // If we created a medic, offer to configure their schedule
        if ((isRequesterSecretary || data.role === "medic") && userId) {
          setCreatedMedicId(userId);
          setCreatedMedicName(fullName);
          setShowSchedulePrompt(true);
          return;
        }
      }

      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar"
      );
    }
  }

  function handleCloseSchedulePrompt(configure: boolean) {
    setShowSchedulePrompt(false);
    if (configure && createdMedicId) {
      setShowScheduleWizard(true);
    } else {
      setCreatedMedicId(null);
      setCreatedMedicName(null);
      onSaved();
    }
  }

  // Role options: secretary can only assign medic
  const availableRoleOptions = isRequesterSecretary
    ? ROLE_OPTIONS.filter((opt) => opt.value === "medic")
    : ROLE_OPTIONS;

  const currentRoleLabel =
    ROLE_OPTIONS.find((opt) => opt.value === selectedRole)?.label ??
    "Profesional de salud";
  const canChangeRole = !isRequesterSecretary;

  const fName = watch("firstName") ?? "";
  const lName = watch("lastName") ?? "";
  const initials =
    `${fName.charAt(0)}${lName.charAt(0)}`.toUpperCase() || "U";

  return (
    <>
    {/* Schedule prompt after creating a medic */}
    <Dialog open={showSchedulePrompt} onOpenChange={() => handleCloseSchedulePrompt(false)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Configurar horarios
          </DialogTitle>
          <DialogDescription>
            El profesional <strong>{createdMedicName}</strong> fue creado exitosamente.
            Deseas configurar sus horarios de atencion ahora?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleCloseSchedulePrompt(false)}>
            Mas tarde
          </Button>
          <Button onClick={() => handleCloseSchedulePrompt(true)}>
            Configurar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Schedule wizard */}
    {createdMedicId && (
      <ScheduleSetupWizard
        open={showScheduleWizard}
        onOpenChange={(v) => {
          if (!v) {
            setShowScheduleWizard(false);
            setCreatedMedicId(null);
            setCreatedMedicName(null);
            onSaved();
          }
        }}
        userId={createdMedicId}
        userName={createdMedicName ?? undefined}
        onComplete={() => {
          setShowScheduleWizard(false);
          setCreatedMedicId(null);
          setCreatedMedicName(null);
          onSaved();
        }}
      />
    )}

    <Dialog open={open && !showSchedulePrompt && !showScheduleWizard} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader className="gap-3 border-b pb-4">
          {isEdit ? (
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {initials}
              </div>
              <div className="space-y-1.5">
                <DialogTitle className="text-lg">Editar usuario</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RolePill label={currentRoleLabel} />
                  {user?.email && (
                    <span className="text-xs text-muted-foreground">
                      · {user.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {showRoleSelect && canChangeRole ? (
                  <div className="w-full max-w-[260px]">
                    <Select
                      value={selectedRole ?? "medic"}
                      onValueChange={(val) => {
                        setValue("role", val);
                        setShowRoleSelect(false);
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Seleccionar rol..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoleOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <RolePill label={currentRoleLabel} />
                    {canChangeRole && (
                      <button
                        type="button"
                        onClick={() => setShowRoleSelect(true)}
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        cambiar
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-lg">Nuevo usuario</DialogTitle>
                <DialogDescription>
                  Recibirá un email para activar la cuenta.
                </DialogDescription>
              </div>
            </>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* First / Last name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-firstName">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="user-firstName" placeholder="Lucía" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-lastName">
                Apellido <span className="text-destructive">*</span>
              </Label>
              <Input id="user-lastName" placeholder="Núñez" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Email + password — create only */}
          {!isEdit && (
            <>
              <div className="space-y-2">
                <Label htmlFor="user-email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  placeholder="nombre@ejemplo.com"
                  {...register("email")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-password">
                  Contraseña <span className="text-destructive">*</span>
                </Label>
                <PasswordInput
                  id="user-password"
                  value={password}
                  onChange={(e) => setValue("password", e.target.value)}
                />
                <PasswordStrength password={password} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="user-confirmPassword">
                    Confirmar contraseña <span className="text-destructive">*</span>
                  </Label>
                  {confirmPassword && (
                    password === confirmPassword ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Coinciden
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                        <X className="h-3.5 w-3.5" />
                        No coinciden
                      </span>
                    )
                  )}
                </div>
                <PasswordInput
                  id="user-confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setValue("confirmPassword", e.target.value)}
                />
              </div>
            </>
          )}

          {/* Professional fields — only for medic role */}
          {isMedicRole && (
            <>
              <div className="space-y-2">
                <Label>
                  <OptionalLabel>Profesión</OptionalLabel>
                </Label>
                <Select
                  value={selectedProfessionConfigId || NO_PROFESSION}
                  onValueChange={(val) =>
                    setValue("professionConfigId", val === NO_PROFESSION ? "" : val)
                  }
                  disabled={loadingSpecs}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar profesión..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROFESSION}>Sin profesión</SelectItem>
                    {professionConfigs.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    <OptionalLabel>Especialidad</OptionalLabel>
                  </Label>
                  <Select
                    value={selectedSpecializationId || NO_SPECIALIZATION}
                    onValueChange={(val) =>
                      setValue("specializationId", val === NO_SPECIALIZATION ? "" : val)
                    }
                    disabled={loadingSpecs}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SPECIALIZATION}>
                        Sin especialidad
                      </SelectItem>
                      {filteredSpecializations.map((spec) => (
                        <SelectItem key={spec.id} value={spec.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: spec.color ?? "var(--muted-foreground)" }}
                            />
                            {spec.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="user-licenseNumber">
                    <OptionalLabel>Matrícula</OptionalLabel>
                  </Label>
                  <Input
                    id="user-licenseNumber"
                    placeholder="MN 12345"
                    {...register("licenseNumber")}
                  />
                  <p className="text-xs text-muted-foreground">MN o MP</p>
                </div>
              </div>
            </>
          )}

          {/* Edit — info bar + advanced password reset */}
          {isEdit && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  Email y rol no son editables desde aquí.
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showAdvanced;
                      setShowAdvanced(next);
                      if (!next) {
                        setValue("changePassword", false);
                        setValue("password", "");
                        setValue("confirmPassword", "");
                      }
                    }}
                    className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Más opciones
                  </button>
                )}
              </div>

              {showAdvanced && isAdmin && (
                <div className="space-y-3 rounded-lg border border-input p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={!!watch("changePassword")}
                      onCheckedChange={(checked) => {
                        setValue("changePassword", checked === true);
                        if (checked !== true) {
                          setValue("password", "");
                          setValue("confirmPassword", "");
                        }
                      }}
                    />
                    Restablecer contraseña
                  </label>
                  {watch("changePassword") && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="user-password-edit">
                          Nueva contraseña <span className="text-destructive">*</span>
                        </Label>
                        <PasswordInput
                          id="user-password-edit"
                          value={password}
                          onChange={(e) => setValue("password", e.target.value)}
                        />
                        <PasswordStrength password={password} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="user-confirmPassword-edit">
                            Confirmar contraseña <span className="text-destructive">*</span>
                          </Label>
                          {confirmPassword && (
                            password === confirmPassword ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <Check className="h-3.5 w-3.5" />
                                Coinciden
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                                <X className="h-3.5 w-3.5" />
                                No coinciden
                              </span>
                            )
                          )}
                        </div>
                        <PasswordInput
                          id="user-confirmPassword-edit"
                          value={confirmPassword}
                          onChange={(e) => setValue("confirmPassword", e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <DialogFooter className={!isEdit ? "sm:items-center sm:justify-between" : undefined}>
            {!isEdit && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={sendInvite}
                  onCheckedChange={(checked) => setSendInvite(checked === true)}
                />
                Enviar invitación por email
              </label>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isEdit ? "Guardar cambios" : "Crear usuario"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
