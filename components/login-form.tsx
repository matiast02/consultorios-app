"use client";

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
import { Stethoscope, AlertCircle, Loader2 } from "lucide-react";

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

  async function onSubmit(values: LoginFormValues) {
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes("deshabilitada")) {
          toast.error("Tu cuenta esta deshabilitada. Contacta al administrador.", {
            duration: 6000,
          });
        } else {
          toast.error("Email o contrasena incorrectos");
        }
        return;
      }

      toast.success("Sesion iniciada correctamente");
      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("Ocurrio un error. Por favor, intenta de nuevo.");
    }
  }

  return (
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
  );
}
