"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { CalendarCheck, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { OnlineBookingSettings } from "@/types";
// Solo tipos (sin dependencia en runtime): el schema combinado vive en reminder-settings-card.
import type { ClinicSettingsFormValues } from "./reminder-settings-card";

// Configuración de reservas online (ClinicSettings). Contrato:
// lib/openapi/paths/online-booking.ts → OnlineBookingSettings, guardado con
// el PUT existente de /api/admin/clinic-settings junto con el resto del formulario.

const NOTES_MAX = 500;

const intField = (msg: string) => z.number({ invalid_type_error: msg, required_error: msg }).int("Usá un número entero");

/** Campos que se suman (vía `.extend()`) al schema del formulario de Configuración → Consultorio. */
export const onlineBookingFormShape = {
  onlineBookingEnabled: z.boolean(),
  onlineBookingMinAdvanceHours: intField("Ingresá un número de horas")
    .min(0, "No puede ser negativo")
    .max(168, "Máximo 168 horas (7 días)"),
  onlineBookingMaxDaysAhead: intField("Ingresá un número de días").min(1, "Mínimo 1 día").max(180, "Máximo 180 días"),
  onlineBookingNotes: z.string().max(NOTES_MAX, `Máx. ${NOTES_MAX} caracteres`).nullable(),
};

export const ONLINE_BOOKING_FORM_DEFAULTS: OnlineBookingSettings = {
  onlineBookingEnabled: false,
  onlineBookingMinAdvanceHours: 2,
  onlineBookingMaxDaysAhead: 30,
  onlineBookingNotes: null,
};

/** Normaliza lo que devuelve GET /api/admin/clinic-settings a los valores del form. */
export function onlineBookingValuesFromSettings(
  s: Partial<Record<keyof OnlineBookingSettings, unknown>> | null | undefined,
): OnlineBookingSettings {
  const src = s ?? {};
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
  return {
    onlineBookingEnabled:
      typeof src.onlineBookingEnabled === "boolean"
        ? src.onlineBookingEnabled
        : ONLINE_BOOKING_FORM_DEFAULTS.onlineBookingEnabled,
    onlineBookingMinAdvanceHours:
      int(src.onlineBookingMinAdvanceHours) ?? ONLINE_BOOKING_FORM_DEFAULTS.onlineBookingMinAdvanceHours,
    onlineBookingMaxDaysAhead: int(src.onlineBookingMaxDaysAhead) ?? ONLINE_BOOKING_FORM_DEFAULTS.onlineBookingMaxDaysAhead,
    onlineBookingNotes:
      typeof src.onlineBookingNotes === "string" && src.onlineBookingNotes.trim() ? src.onlineBookingNotes : null,
  };
}

interface OnlineBookingSettingsCardProps {
  form: UseFormReturn<ClinicSettingsFormValues>;
}

export function OnlineBookingSettingsCard({ form }: OnlineBookingSettingsCardProps) {
  const {
    control,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = form;
  const enabled = watch("onlineBookingEnabled");
  const notes = watch("onlineBookingNotes");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" /> Reservas online
        </CardTitle>
        <CardDescription>
          Los pacientes piden turno desde el sitio eligiendo profesional, día y horario. Entran como pendientes y
          recepción los confirma desde el panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Controller
          control={control}
          name="onlineBookingEnabled"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Aceptar reservas online</span>
                <span className="block text-xs text-muted-foreground">
                  Activa la página <code className="font-mono">/reservar</code> y los botones “Solicitar turno” del
                  sitio llevan ahí.
                </span>
              </span>
              <Switch checked={!!field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />

        <fieldset disabled={!enabled} className={cn("space-y-6 transition-opacity", !enabled && "opacity-60")}>
          <legend className="sr-only">Opciones de reservas online</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ob-min-advance">Anticipación mínima</Label>
              <Controller
                control={control}
                name="onlineBookingMinAdvanceHours"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Input
                      id="ob-min-advance"
                      ref={field.ref}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={168}
                      className="w-24"
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
                      aria-invalid={!!errors.onlineBookingMinAdvanceHours}
                      aria-describedby="ob-min-advance-help"
                    />
                    <span className="text-sm text-muted-foreground">horas antes del turno</span>
                  </div>
                )}
              />
              {errors.onlineBookingMinAdvanceHours ? (
                <p className="text-xs text-destructive">{errors.onlineBookingMinAdvanceHours.message}</p>
              ) : (
                <p id="ob-min-advance-help" className="text-xs text-muted-foreground">
                  Entre 0 y 168. Da tiempo a recepción para confirmar antes del turno.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ob-max-days">Hasta cuántos días adelante</Label>
              <Controller
                control={control}
                name="onlineBookingMaxDaysAhead"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Input
                      id="ob-max-days"
                      ref={field.ref}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={180}
                      className="w-24"
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
                      aria-invalid={!!errors.onlineBookingMaxDaysAhead}
                      aria-describedby="ob-max-days-help"
                    />
                    <span className="text-sm text-muted-foreground">días</span>
                  </div>
                )}
              />
              {errors.onlineBookingMaxDaysAhead ? (
                <p className="text-xs text-destructive">{errors.onlineBookingMaxDaysAhead.message}</p>
              ) : (
                <p id="ob-max-days-help" className="text-xs text-muted-foreground">
                  Entre 1 y 180. Lo habitual es 30.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-notes">
              Aviso para el paciente <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Controller
              control={control}
              name="onlineBookingNotes"
              render={({ field }) => (
                <Textarea
                  id="ob-notes"
                  ref={field.ref}
                  rows={3}
                  maxLength={NOTES_MAX}
                  placeholder="Ej.: Traé tu DNI y la credencial de la obra social. Si no podés venir, cancelá desde el link."
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                  aria-invalid={!!errors.onlineBookingNotes}
                  aria-describedby="ob-notes-help"
                />
              )}
            />
            <div className="flex items-start justify-between gap-3">
              <p id="ob-notes-help" className="text-xs text-muted-foreground">
                Se muestra antes de confirmar la reserva y en la pantalla final.
              </p>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {(notes ?? "").length}/{NOTES_MAX}
              </span>
            </div>
            {errors.onlineBookingNotes && (
              <p className="text-xs text-destructive">{errors.onlineBookingNotes.message}</p>
            )}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              El formulario público no pide motivo de consulta ni datos de salud: nombre, DNI, teléfono, email y obra
              social opcionales.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Cada profesional elige si aparece en la reserva online desde{" "}
              <strong className="font-medium text-foreground">Configuración → Horarios</strong> (“Acepto reservas
              online”). Se ofrecen solo sus horarios libres, respetando días bloqueados y turnos existentes.
            </span>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {enabled ? (
            <Button asChild variant="outline" size="sm">
              <a href="/reservar" target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Ver la página de reservas
              </a>
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
