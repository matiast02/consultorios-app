"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
import {
  Stethoscope,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "La contrasena debe tener al menos 8 caracteres")
      .regex(/[A-Z]/, "Debe contener al menos una mayuscula")
      .regex(/[0-9]/, "Debe contener al menos un numero"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit(values: ResetPasswordFormValues) {
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error ?? "Error al restablecer la contrasena"
        );
      }

      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al restablecer la contrasena"
      );
    }
  }

  // No token provided
  if (!token) {
    return (
      <Card className="shadow-lg">
        <div className="h-1.5 rounded-t-xl bg-primary" />

        <CardHeader className="space-y-3 pb-4 pt-6">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-bold">
              Token no proporcionado
            </CardTitle>
            <CardDescription className="mt-1">
              El enlace no es valido o ha expirado. Solicita uno nuevo.
            </CardDescription>
          </div>
        </CardHeader>

        <CardFooter className="justify-center">
          <Link
            href="/forgot-password"
            className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
          >
            Solicitar nuevo enlace
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <div className="h-1.5 rounded-t-xl bg-primary" />

      <CardHeader className="space-y-3 pb-4 pt-6">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Stethoscope className="h-6 w-6 text-primary" />
          </div>
        </div>
        <div className="text-center">
          <CardTitle className="text-2xl font-bold">Nueva Contrasena</CardTitle>
          <CardDescription className="mt-1">
            Ingresa tu nueva contrasena para restablecer el acceso a tu cuenta.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {success ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-medium">
              Contrasena restablecida correctamente
            </p>
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
            >
              Ir a Iniciar Sesion
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="password">Nueva contrasena</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className={`transition-all duration-200 focus-visible:ring-primary ${
                  errors.password
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
                {...register("password")}
              />
              {errors.password && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar contrasena</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className={`transition-all duration-200 focus-visible:ring-primary ${
                  errors.confirmPassword
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Minimo 8 caracteres, una mayuscula y un numero
            </p>

            <Button
              type="submit"
              className="w-full shadow-sm shadow-primary/20 transition-all duration-200"
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isSubmitting ? "Restableciendo..." : "Restablecer Contrasena"}
            </Button>
          </form>
        )}
      </CardContent>

      {!success && (
        <CardFooter>
          <p className="w-full text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
            >
              Volver a Iniciar Sesion
            </Link>
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
