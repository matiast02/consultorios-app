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
import { Loader2, Eye, EyeOff, Check, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SecretaryUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const formSchema = z.object({
  firstName: z.string().min(2, "El nombre es obligatorio"),
  lastName: z.string().min(2, "El apellido es obligatorio"),
  email: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

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

interface SecretaryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretary?: SecretaryUser | null;
  onSaved: () => void;
}

export function SecretaryFormDialog({
  open,
  onOpenChange,
  secretary,
  onSaved,
}: SecretaryFormDialogProps) {
  const isEdit = !!secretary;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const password = watch("password") ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";

  useEffect(() => {
    if (open) {
      if (secretary) {
        reset({
          firstName: secretary.firstName ?? "",
          lastName: secretary.lastName ?? "",
          email: secretary.email ?? "",
          password: "",
          confirmPassword: "",
        });
      } else {
        reset({
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
      }
    }
  }, [open, secretary, reset]);

  async function onSubmit(data: FormValues) {
    try {
      const fullName = `${data.firstName} ${data.lastName}`.trim();

      if (isEdit) {
        const res = await fetch(`/api/users/${secretary.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fullName,
            firstName: data.firstName,
            lastName: data.lastName,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al actualizar secretaria");
        }

        toast.success("Secretaria actualizada exitosamente");
      } else {
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
        if (data.password !== data.confirmPassword) {
          toast.error("Las contrasenas no coinciden");
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
          throw new Error(err.error ?? "Error al crear secretaria");
        }

        const registerJson = await registerRes.json();
        const userId = registerJson.user?.id;

        // Assign secretary role and names
        if (userId) {
          await fetch(`/api/users/${userId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: fullName,
              firstName: data.firstName,
              lastName: data.lastName,
              role: "secretary",
            }),
          });
        }

        toast.success("Secretaria creada exitosamente");
      }

      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar"
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar Secretaria" : "Nueva Secretaria"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos de la secretaria."
              : "Completa los datos para registrar una nueva secretaria."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* First / Last name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sec-firstName">Nombre *</Label>
              <Input id="sec-firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sec-lastName">Apellido *</Label>
              <Input id="sec-lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Email + Password (create only) */}
          {!isEdit && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sec-email">Email *</Label>
                <Input
                  id="sec-email"
                  type="email"
                  {...register("email")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-password">Contrasena *</Label>
                <PasswordInput
                  id="sec-password"
                  value={password}
                  onChange={(e) => setValue("password", e.target.value)}
                />
                <PasswordRequirements password={password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-confirmPassword">Confirmar contrasena *</Label>
                <PasswordInput
                  id="sec-confirmPassword"
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
              {isEdit ? "Guardar cambios" : "Crear Secretaria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
