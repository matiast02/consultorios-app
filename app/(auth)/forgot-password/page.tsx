"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Stethoscope, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email("Ingresa un email valido"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      // Always show success regardless of response to avoid email enumeration
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    }
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
          <CardTitle className="text-2xl font-bold">
            Recuperar Contrasena
          </CardTitle>
          <CardDescription className="mt-1">
            Ingresa tu email y te enviaremos instrucciones para restablecer tu
            contrasena.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm text-muted-foreground">
              Si el email esta registrado, recibiras instrucciones para
              restablecer tu contrasena.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nombre@ejemplo.com"
                autoComplete="email"
                className={`transition-all duration-200 focus-visible:ring-primary ${
                  errors.email
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
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

            <Button
              type="submit"
              className="w-full shadow-sm shadow-primary/20 transition-all duration-200"
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isSubmitting ? "Enviando..." : "Enviar instrucciones"}
            </Button>
          </form>
        )}
      </CardContent>

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
    </Card>
  );
}
