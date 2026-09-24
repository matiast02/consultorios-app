"use client";

import { cn } from "@/lib/utils";
import type { WizardStep } from "./booking-storage";

const STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: "Profesional" },
  { n: 2, label: "Día y horario" },
  { n: 3, label: "Tus datos" },
  { n: 4, label: "Confirmar" },
];

export function BookingStepper({
  step,
  maxStep,
  onGo,
}: {
  step: WizardStep;
  /** Último paso al que se puede saltar (los anteriores ya están completos). */
  maxStep: WizardStep;
  onGo: (step: WizardStep) => void;
}) {
  return (
    <nav aria-label="Pasos de la reserva" className="mb-5">
      <p className="mb-2 text-[13px] font-medium text-[var(--muted)]">
        Paso {step} de {STEPS.length}
      </p>
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s) => {
          const current = s.n === step;
          const done = s.n < step;
          const clickable = !current && s.n <= maxStep;
          return (
            <li key={s.n} className="min-w-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onGo(s.n)}
                aria-current={current ? "step" : undefined}
                className="group w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-soft-2)] disabled:cursor-default"
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-1.5 rounded-full transition-colors",
                    current || done ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]",
                    clickable && "group-hover:bg-[var(--primary-hover)]",
                  )}
                />
                <span
                  className={cn(
                    "mt-1.5 block truncate text-[12px] font-semibold",
                    current ? "text-[var(--ink)]" : done ? "text-[var(--primary-deep)]" : "text-[var(--muted-2)]",
                    clickable && "group-hover:underline group-hover:underline-offset-2",
                  )}
                >
                  <span className="sr-only">{`Paso ${s.n}${done ? " (completo)" : ""}: `}</span>
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
