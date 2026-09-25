"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { passwordChecks, passwordStrength } from "@/lib/password-policy";

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
}

/** Campo de contraseña con botón para mostrarla. Compartido por los diálogos de usuarios y secretarias. */
export function PasswordInput({ id, value, onChange, placeholder, autoComplete = "new-password" }: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

const STRENGTH_LEVELS = [
  { label: "", bar: "", text: "" },
  { label: "Débil", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  { label: "Regular", bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  { label: "Buena", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { label: "Fuerte", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
] as const;

/** Medidor de fuerza + lista de requisitos, con la regla única de lib/password-policy.ts. */
export function PasswordStrength({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const score = passwordStrength(password);
  const level = STRENGTH_LEVELS[Math.min(score, STRENGTH_LEVELS.length - 1)];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {checks.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? level.bar : "bg-muted"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Seguridad</span>
        {score > 0 && <span className={`font-medium ${level.text}`}>{level.label}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {checks.map((check) => (
          <div key={check.key} className="flex items-center gap-1.5 text-xs">
            {check.met ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            )}
            <span className={check.met ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
