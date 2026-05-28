"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, AlertCircle, Loader2, Users, ShieldCheck, Briefcase } from "lucide-react";

type DevUser = {
  email: string;
  role: "admin" | "medic" | "secretary";
  name: string;
  detail?: string;
};

const DEV_USERS: DevUser[] = [
  { email: "admin@consultorio.com", role: "admin", name: "Admin Sistema" },
  { email: "dr.gervilla@consultorio.com", role: "medic", name: "Dr. Gervilla", detail: "Medicina General" },
  { email: "dra.lopez@consultorio.com", role: "medic", name: "Dra. López", detail: "Pediatría" },
  { email: "maria@consultorio.com", role: "secretary", name: "María González" },
];
const DEV_PASSWORD = "password123";

const ROLE_META: Record<DevUser["role"], { label: string; icon: typeof Stethoscope; badge: string }> = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  },
  medic: {
    label: "Médico",
    icon: Stethoscope,
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  },
  secretary: {
    label: "Secretaria",
    icon: Briefcase,
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
};

const loginSchema = z.object({
  email: z.string().email("Ingresa un email valido"),
  password: z.string().min(1, "La contrasena es requerida"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const isDev = process.env.NODE_ENV !== "production";
  const [pendingDevLogin, setPendingDevLogin] = useState<string | null>(null);

  async function performLogin(email: string, password: string) {
    try {
      const result = await signIn("credentials", { email, password, redirect: false });

      if (result?.error) {
        if (result.error.includes("deshabilitada")) {
          toast.error("Tu cuenta esta deshabilitada. Contacta al administrador.", { duration: 6000 });
        } else {
          toast.error("Email o contrasena incorrectos");
        }
        return false;
      }

      toast.success("Sesion iniciada correctamente");
      router.push(callbackUrl);
      router.refresh();
      return true;
    } catch {
      toast.error("Ocurrio un error. Por favor, intenta de nuevo.");
      return false;
    }
  }

  async function onSubmit(values: LoginFormValues) {
    await performLogin(values.email, values.password);
  }

  async function loginAs(user: DevUser) {
    setPendingDevLogin(user.email);
    try {
      await performLogin(user.email, DEV_PASSWORD);
    } finally {
      setPendingDevLogin(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-lg">
        {/* Colored accent top bar */}
        <div className="h-1.5 rounded-t-xl bg-primary" />

        <CardHeader className="space-y-3 pb-4 pt-6">
          {/* Medical icon */}
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Stethoscope className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-bold">Iniciar Sesion</CardTitle>
            <CardDescription className="mt-1">
              Ingresa con tu cuenta para acceder al consultorio
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nombre@ejemplo.com"
                autoComplete="email"
                className={`transition-all duration-200 focus-visible:ring-primary ${
                  errors.email ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
                {...register("email")}
              />
              {errors.email && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contrasena</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className={`transition-all duration-200 focus-visible:ring-primary ${
                  errors.password ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
                {...register("password")}
              />
              {errors.password && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.password.message}
                </p>
              )}
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  ¿Olvidaste tu contrasena?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full shadow-sm shadow-primary/20 transition-all duration-200"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Iniciando sesion..." : "Iniciar Sesion"}
            </Button>
          </form>
        </CardContent>

        <CardFooter>
          <p className="w-full text-center text-sm text-muted-foreground">
            Contacta al administrador para obtener una cuenta.
          </p>
        </CardFooter>
      </Card>

      {isDev && (
        <Card className="border-dashed bg-muted/30">
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Login as (dev)</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Click para iniciar sesión con un usuario de prueba.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {DEV_USERS.map((user) => {
                const meta = ROLE_META[user.role];
                const Icon = meta.icon;
                const isPending = pendingDevLogin === user.email;
                const isDisabled = pendingDevLogin !== null || isSubmitting;
                return (
                  <li key={user.email}>
                    <button
                      type="button"
                      onClick={() => loginAs(user)}
                      disabled={isDisabled}
                      className="group flex w-full items-center gap-2.5 rounded-md border bg-background/80 px-2.5 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${meta.badge}`}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-foreground">{user.name}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {meta.label}{user.detail ? ` · ${user.detail}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
