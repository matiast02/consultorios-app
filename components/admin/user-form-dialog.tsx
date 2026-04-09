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
import { Loader2, CalendarDays } from "lucide-react";
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
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  email: z.string().optional(),
  password: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  specializationId: z.string().optional(),
  role: z.string().min(1, "El rol es obligatorio"),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────

const NO_SPECIALIZATION = "__none__";

// ─── Component ───────────────────────────────────────────────────────────────

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserWithRoles | null;
  onSaved: () => void;
}

const ROLE_OPTIONS = [
  { value: "medic", label: "Medico" },
  { value: "secretary", label: "Secretaria" },
  { value: "admin", label: "Administrador" },
];

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  onSaved,
}: UserFormDialogProps) {
  const isEdit = !!user;
  const [specializations, setSpecializations] = useState<SpecializationOption[]>([]);
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
      name: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      specializationId: "",
      role: "medic",
    },
  });

  const selectedRole = watch("role");
  const selectedSpecializationId = watch("specializationId");

  // Fetch specializations when dialog opens
  useEffect(() => {
    if (open) {
      setLoadingSpecs(true);
      fetch("/api/specializations")
        .then((res) => res.json())
        .then((json) => {
          const list = json.data ?? [];
          setSpecializations(Array.isArray(list) ? list : []);
        })
        .catch(() => {
          setSpecializations([]);
        })
        .finally(() => setLoadingSpecs(false));
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (user) {
        const primaryRole = user.roles?.[0]?.name ?? "medic";
        reset({
          name: user.name ?? "",
          email: user.email ?? "",
          password: "",
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          specializationId: user.specialization?.id ?? "",
          role: primaryRole,
        });
      } else {
        reset({
          name: "",
          email: "",
          password: "",
          firstName: "",
          lastName: "",
          specializationId: "",
          role: "medic",
        });
      }
    }
  }, [open, user, reset]);

  async function onSubmit(data: FormValues) {
    try {
      const specializationId =
        data.specializationId && data.specializationId !== NO_SPECIALIZATION
          ? data.specializationId
          : null;

      if (isEdit) {
        // Edit mode
        const res = await fetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            firstName: data.firstName || null,
            lastName: data.lastName || null,
            specializationId,
            role: data.role,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al actualizar usuario");
        }

        toast.success("Usuario actualizado exitosamente");
      } else {
        // Create mode - validate required fields
        if (!data.email) {
          toast.error("El email es obligatorio");
          return;
        }
        if (!data.password || data.password.length < 8) {
          toast.error("La contrasena debe tener al menos 8 caracteres");
          return;
        }
        if (!/[A-Z]/.test(data.password)) {
          toast.error("La contrasena debe contener al menos una mayuscula");
          return;
        }
        if (!/[0-9]/.test(data.password)) {
          toast.error("La contrasena debe contener al menos un numero");
          return;
        }

        // First create the user via register
        const registerRes = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
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

        // Then update with additional fields
        if (userId) {
          await fetch(`/api/users/${userId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: data.name,
              firstName: data.firstName || null,
              lastName: data.lastName || null,
              specializationId,
              role: data.role,
            }),
          });
        }

        toast.success("Usuario creado exitosamente");

        // If we created a medic, offer to configure their schedule
        if (data.role === "medic" && userId) {
          setCreatedMedicId(userId);
          setCreatedMedicName(data.name);
          setShowSchedulePrompt(true);
          return; // Don't close yet
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
            El medico <strong>{createdMedicName}</strong> fue creado exitosamente.
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
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="user-name">Nombre de usuario *</Label>
            <Input id="user-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* First / Last name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-firstName">Nombre</Label>
              <Input id="user-firstName" {...register("firstName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-lastName">Apellido</Label>
              <Input id="user-lastName" {...register("lastName")} />
            </div>
          </div>

          {/* Email + Password (create only) */}
          {!isEdit && (
            <>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email *</Label>
                <Input
                  id="user-email"
                  type="email"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Contrasena *</Label>
                <Input
                  id="user-password"
                  type="password"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Specialization */}
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
                {specializations.map((spec) => (
                  <SelectItem key={spec.id} value={spec.id}>
                    {spec.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>Rol *</Label>
            <Select
              value={selectedRole ?? "medic"}
              onValueChange={(val) => setValue("role", val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar rol..." />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">
                {errors.role.message}
              </p>
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
              {isEdit ? "Guardar cambios" : "Crear Usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
