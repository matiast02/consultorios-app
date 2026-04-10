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
import { Loader2, CalendarDays, Eye, EyeOff, Check, X } from "lucide-react";
import { ScheduleSetupWizard } from "@/components/schedule-setup-wizard";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserWithRoles {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  specialization?: { id: string; name: string } | null;
  roles: { id: string; name: string }[];
}

interface SpecializationOption {
  id: string;
  name: string;
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

// ─── Password Requirements ──────────────────────────────────────────────────

function PasswordRequirements({ password }: { password: string }) {
  const requirements = [
    { label: "Minimo 8 caracteres", met: password.length >= 8 },
    { label: "Al menos una mayuscula", met: /[A-Z]/.test(password) },
    { label: "Al menos un numero", met: /[0-9]/.test(password) },
  ];

  return (
    <div className="space-y-1 mt-1.5">
      {requirements.map((req) => (
        <div key={req.label} className="flex items-center gap-1.5 text-xs">
          {req.met ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <X className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={req.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
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
          licenseNumber: (user as Record<string, unknown>).licenseNumber as string ?? "",
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar Usuario" : "Nuevo Usuario"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos del usuario."
              : "Completa los datos para registrar un nuevo usuario."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Role — shown first to control conditional fields */}
          <div className="space-y-2">
            <Label>Rol *</Label>
            {isRequesterSecretary ? (
              <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                Profesional de salud
              </div>
            ) : (
              <Select
                value={selectedRole ?? "medic"}
                onValueChange={(val) => setValue("role", val)}
              >
                <SelectTrigger>
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
            )}
            {errors.role && (
              <p className="text-sm text-destructive">
                {errors.role.message}
              </p>
            )}
          </div>

          {/* First / Last name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-firstName">Nombre *</Label>
              <Input id="user-firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-lastName">Apellido *</Label>
              <Input id="user-lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Email (create only) */}
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="user-email">Email *</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="nombre@ejemplo.com"
                {...register("email")}
              />
            </div>
          )}

          {/* Email (edit — read-only) */}
          {isEdit && user?.email && (
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {user.email}
              </div>
            </div>
          )}

          {/* Password — create mode: always shown */}
          {!isEdit && (
            <>
              <div className="space-y-2">
                <Label htmlFor="user-password">Contrasena *</Label>
                <PasswordInput
                  id="user-password"
                  value={password}
                  onChange={(e) => setValue("password", e.target.value)}
                />
                <PasswordRequirements password={password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-confirmPassword">Confirmar contrasena *</Label>
                <PasswordInput
                  id="user-confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setValue("confirmPassword", e.target.value)}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <X className="h-3 w-3" />
                    Las contrasenas no coinciden
                  </p>
                )}
                {confirmPassword && password === confirmPassword && password.length > 0 && (
                  <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Las contrasenas coinciden
                  </p>
                )}
              </div>
            </>
          )}

          {/* Password reset — edit mode: admin can reset */}
          {isEdit && isAdmin && (
            <div className="space-y-3 rounded-md border border-input p-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!watch("changePassword")}
                  onChange={(e) => {
                    setValue("changePassword", e.target.checked);
                    if (!e.target.checked) {
                      setValue("password", "");
                      setValue("confirmPassword", "");
                    }
                  }}
                  className="rounded border-input"
                />
                Restablecer contrasena
              </label>
              {watch("changePassword") && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="user-password-edit">Nueva contrasena *</Label>
                    <PasswordInput
                      id="user-password-edit"
                      value={password}
                      onChange={(e) => setValue("password", e.target.value)}
                    />
                    <PasswordRequirements password={password} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user-confirmPassword-edit">Confirmar contrasena *</Label>
                    <PasswordInput
                      id="user-confirmPassword-edit"
                      value={confirmPassword}
                      onChange={(e) => setValue("confirmPassword", e.target.value)}
                    />
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <X className="h-3 w-3" />
                        Las contrasenas no coinciden
                      </p>
                    )}
                    {confirmPassword && password === confirmPassword && password.length > 0 && (
                      <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Las contrasenas coinciden
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Professional fields — only for medic role */}
          {isMedicRole && (
            <>
              {/* Profession Config */}
              <div className="space-y-2">
                <Label>Profesion</Label>
                <Select
                  value={selectedProfessionConfigId || NO_PROFESSION}
                  onValueChange={(val) =>
                    setValue("professionConfigId", val === NO_PROFESSION ? "" : val)
                  }
                  disabled={loadingSpecs}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar profesion..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROFESSION}>
                      Sin profesion
                    </SelectItem>
                    {professionConfigs.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Specialization — filtered by profession */}
              <div className="space-y-2">
                <Label>Especialidad</Label>
                <Select
                  value={selectedSpecializationId || NO_SPECIALIZATION}
                  onValueChange={(val) =>
                    setValue("specializationId", val === NO_SPECIALIZATION ? "" : val)
                  }
                  disabled={loadingSpecs}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar especialidad..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SPECIALIZATION}>
                      Sin especialidad
                    </SelectItem>
                    {filteredSpecializations.map((spec) => (
                      <SelectItem key={spec.id} value={spec.id}>
                        {spec.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* License number */}
              <div className="space-y-2">
                <Label htmlFor="user-licenseNumber">Matricula profesional</Label>
                <Input
                  id="user-licenseNumber"
                  placeholder="Ej: MN 12345"
                  {...register("licenseNumber")}
                />
              </div>
            </>
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
              {isEdit ? "Guardar cambios" : "Crear Usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
