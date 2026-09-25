"use client";

import { useEffect, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EMPTY_BOOKING_PATIENT,
  bookingPatientSchema,
  onlyDigits,
  type BookingPatientField,
  type BookingPatientValues,
} from "@/lib/booking-client";
import { PrivacyConsentText, PrivacyDetails } from "@/components/landing/privacy-notice";
import { Panel, StickyActions, btnPrimary } from "./public-ui";

// Paso 3: datos mínimos del solicitante. A propósito NO hay campo de motivo ni
// texto libre: el formulario público no captura datos de salud.

interface StepPatientProps {
  defaultValues: BookingPatientValues;
  /** Errores de campo devueltos por el servidor (400). */
  serverErrors: Partial<Record<BookingPatientField, string>> | null;
  insuranceSuggestions: string[];
  summary: ReactNode;
  onChange: (values: BookingPatientValues) => void;
  onHoneypot: (value: string) => void;
  onSubmit: (values: BookingPatientValues) => void;
}

const fieldClass =
  "h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 text-[16px] text-[var(--ink)] transition placeholder:text-[var(--muted-2)] focus:border-[var(--primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--primary-soft)] aria-[invalid=true]:border-rose-400";

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-[var(--ink-2)]">
        {label}
        {optional && <span className="font-normal text-[var(--muted-2)]"> (opcional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-rose-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function StepPatient({
  defaultValues,
  serverErrors,
  insuranceSuggestions,
  summary,
  onChange,
  onHoneypot,
  onSubmit,
}: StepPatientProps) {
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<BookingPatientValues>({
    resolver: zodResolver(bookingPatientSchema),
    defaultValues,
    mode: "onTouched",
  });

  // Errores del servidor → marcar los campos.
  useEffect(() => {
    if (!serverErrors) return;
    for (const [field, message] of Object.entries(serverErrors)) {
      if (message) setError(field as BookingPatientField, { type: "server", message });
    }
  }, [serverErrors, setError]);

  // Guardar el progreso mientras se escribe (sessionStorage, vía el asistente).
  useEffect(() => {
    const sub = watch((values) => onChange({ ...EMPTY_BOOKING_PATIENT, ...values } as BookingPatientValues));
    return () => sub.unsubscribe();
  }, [watch, onChange]);

  const dniReg = register("dni");
  const describedBy = (id: string, hasHint: boolean) =>
    errors[id as BookingPatientField] ? `bp-${id}-error` : hasHint ? `bp-${id}-hint` : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Panel>
        <h1
          id="booking-step-title"
          tabIndex={-1}
          className="text-[24px] font-bold leading-tight tracking-tight text-[var(--ink)] outline-none"
        >
          Tus datos
        </h1>
        <p className="mt-1 text-[15.5px] text-[var(--muted)]">Los usamos solo para identificarte y avisarte del turno.</p>
        <div className="mt-4">{summary}</div>

        {/* Honeypot: invisible para personas, los bots suelen completarlo. No quitar. */}
        <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden" style={{ left: "-9999px" }}>
          <label htmlFor="bp-website">No completar este campo</label>
          <input
            id="bp-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
            onChange={(e) => onHoneypot(e.target.value)}
          />
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="bp-firstName" label="Nombre" error={errors.firstName?.message}>
              <input
                id="bp-firstName"
                type="text"
                autoComplete="given-name"
                maxLength={100}
                className={fieldClass}
                aria-invalid={!!errors.firstName}
                aria-describedby={describedBy("firstName", false)}
                {...register("firstName")}
              />
            </Field>
            <Field id="bp-lastName" label="Apellido" error={errors.lastName?.message}>
              <input
                id="bp-lastName"
                type="text"
                autoComplete="family-name"
                maxLength={100}
                className={fieldClass}
                aria-invalid={!!errors.lastName}
                aria-describedby={describedBy("lastName", false)}
                {...register("lastName")}
              />
            </Field>
          </div>

          <Field
            id="bp-dni"
            label="DNI"
            hint="Solo números, sin puntos."
            error={errors.dni?.message}
          >
            <input
              id="bp-dni"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="30123456"
              maxLength={10}
              className={cn(fieldClass, "tabular-nums tracking-wide")}
              aria-invalid={!!errors.dni}
              aria-describedby={describedBy("dni", true)}
              {...dniReg}
              onChange={(e) => {
                e.target.value = onlyDigits(e.target.value, 10);
                void dniReg.onChange(e);
              }}
            />
          </Field>

          <Field
            id="bp-phone"
            label="Celular"
            hint="Con código de área. Recepción te llama o te escribe a este número para confirmar."
            error={errors.phone?.message}
          >
            <input
              id="bp-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="11 5555-5555"
              maxLength={30}
              className={fieldClass}
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy("phone", true)}
              {...register("phone")}
            />
          </Field>

          <Field
            id="bp-email"
            label="Email"
            optional
            hint="Si lo dejás, te mandamos el link para ver o cancelar tu reserva."
            error={errors.email?.message}
          >
            <input
              id="bp-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tucorreo@email.com"
              className={fieldClass}
              aria-invalid={!!errors.email}
              aria-describedby={describedBy("email", true)}
              {...register("email")}
            />
          </Field>

          <Field
            id="bp-healthInsurance"
            label="Obra social o prepaga"
            optional
            hint="Escribila como figura en tu credencial, o “Particular”."
            error={errors.healthInsurance?.message}
          >
            <input
              id="bp-healthInsurance"
              type="text"
              autoComplete="off"
              maxLength={80}
              list={insuranceSuggestions.length > 0 ? "bp-os-list" : undefined}
              placeholder="Ej.: OSDE, PAMI, Particular"
              className={fieldClass}
              aria-invalid={!!errors.healthInsurance}
              aria-describedby={describedBy("healthInsurance", true)}
              {...register("healthInsurance")}
            />
            {insuranceSuggestions.length > 0 && (
              <datalist id="bp-os-list">
                {insuranceSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
                <option value="Particular" />
              </datalist>
            )}
          </Field>
        </div>

        <p className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--section-tint)] px-3.5 py-3 text-[13.5px] text-[var(--ink-2)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
          No te pedimos el motivo de la consulta: eso lo hablás directamente con el profesional.
        </p>

        <div className="mt-5 space-y-2 text-[13.5px] text-[var(--muted)]">
          <label htmlFor="bp-privacy" className="flex cursor-pointer items-start gap-3 leading-snug">
            <input
              id="bp-privacy"
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--primary)]"
              aria-invalid={!!errors.privacyAccepted}
              aria-describedby={errors.privacyAccepted ? "bp-privacy-error" : undefined}
              {...register("privacyAccepted")}
            />
            <span>
              <PrivacyConsentText />
            </span>
          </label>
          {errors.privacyAccepted && (
            <p id="bp-privacy-error" className="text-[13px] font-medium text-rose-700">
              {errors.privacyAccepted.message}
            </p>
          )}
          <PrivacyDetails className="pl-8" />
        </div>
      </Panel>

      <StickyActions>
        <button type="submit" className={btnPrimary}>
          Revisar la reserva
        </button>
      </StickyActions>
    </form>
  );
}
