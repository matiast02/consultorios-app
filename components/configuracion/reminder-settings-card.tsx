"use client";

import { useMemo, useRef, useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle, BellRing, Eye, Mail, MessageCircle, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { clinicSettingsSchema } from "@/lib/validations";
// Puro TS (sin dependencias de Node): la vista previa usa exactamente el mismo render que el servidor.
import { DEFAULT_REMINDER_TEMPLATE, renderReminderText } from "@/lib/reminders/message";
import type { ReminderChannel, ReminderSettings } from "@/types";
import { onlineBookingFormShape } from "./online-booking-settings-card";

// Configuración de recordatorios (ClinicSettings). Contrato:
// contracts/api-schemas/reminders.yaml → ReminderSettings, guardado con el PUT
// existente de /api/admin/clinic-settings junto con el resto del formulario.

const REMINDER_CHANNELS = ["EMAIL", "WHATSAPP", "SMS"] as const satisfies readonly ReminderChannel[];
const DEFAULT_CHANNELS: ReminderChannel[] = ["EMAIL", "WHATSAPP"];
const DEFAULT_SECOND_HOURS = 2;
const TEMPLATE_MAX = 1000;

export const REMINDER_PLACEHOLDERS = [
  { token: "{paciente}", help: "Nombre de pila del paciente" },
  { token: "{fecha}", help: "Día del turno (ej.: martes, 30 de septiembre)" },
  { token: "{hora}", help: "Hora del turno" },
  { token: "{profesional}", help: "Profesional" },
  { token: "{consultorio}", help: "Nombre del consultorio" },
  { token: "{direccion}", help: "Dirección del consultorio" },
  { token: "{link}", help: "Link para confirmar o cancelar" },
] as const;

const KNOWN_PLACEHOLDERS = new Set<string>(REMINDER_PLACEHOLDERS.map((p) => p.token));

const hoursNumber = (max: number, maxMsg: string) =>
  z
    .number({ invalid_type_error: "Ingresá un número de horas", required_error: "Ingresá un número de horas" })
    .int("Usá un número entero")
    .min(1, "Mínimo 1 hora")
    .max(max, maxMsg);

/** Schema del formulario de Configuración → Consultorio (datos + recordatorios + reservas online). */
export const clinicSettingsFormSchema = clinicSettingsSchema
  .extend({
    remindersEnabled: z.boolean(),
    reminderHoursBefore: hoursNumber(168, "Máximo 168 horas (7 días)"),
    reminderSecondHoursBefore: hoursNumber(48, "Máximo 48 horas").nullable(),
    reminderChannels: z.array(z.enum(REMINDER_CHANNELS)),
    reminderTemplate: z.string().max(TEMPLATE_MAX, `Máx. ${TEMPLATE_MAX} caracteres`).nullable(),
  })
  .extend(onlineBookingFormShape)
  .superRefine((v, ctx) => {
    if (v.remindersEnabled && !v.reminderChannels.some((c) => c !== "SMS")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reminderChannels"], message: "Elegí al menos un canal" });
    }
    if (v.reminderSecondHoursBefore != null && v.reminderSecondHoursBefore >= v.reminderHoursBefore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reminderSecondHoursBefore"],
        message: "Tiene que ser más cerca del turno que el primer recordatorio",
      });
    }
  });

export type ClinicSettingsFormValues = z.infer<typeof clinicSettingsFormSchema>;

export const REMINDER_FORM_DEFAULTS: ReminderSettings = {
  remindersEnabled: true,
  reminderHoursBefore: 24,
  reminderSecondHoursBefore: null,
  reminderChannels: DEFAULT_CHANNELS,
  reminderTemplate: null,
};

function parseChannels(raw: unknown): ReminderChannel[] {
  let value = raw;
  // En la base es un JSON string; el backend puede devolverlo ya parseado o no.
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  if (!Array.isArray(value)) return [...DEFAULT_CHANNELS];
  return REMINDER_CHANNELS.filter((c) => value.includes(c));
}

/** Normaliza lo que devuelve GET /api/admin/clinic-settings a los valores del form. */
export function reminderValuesFromSettings(s: Partial<Record<keyof ReminderSettings, unknown>> | null | undefined): ReminderSettings {
  const src = s ?? {};
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
  return {
    remindersEnabled: typeof src.remindersEnabled === "boolean" ? src.remindersEnabled : REMINDER_FORM_DEFAULTS.remindersEnabled,
    reminderHoursBefore: int(src.reminderHoursBefore) ?? REMINDER_FORM_DEFAULTS.reminderHoursBefore,
    reminderSecondHoursBefore: int(src.reminderSecondHoursBefore),
    reminderChannels: parseChannels(src.reminderChannels),
    reminderTemplate:
      typeof src.reminderTemplate === "string" && src.reminderTemplate.trim() ? src.reminderTemplate : null,
  };
}

// ─── UI ─────────────────────────────────────────────────────────────────────

const CHANNEL_OPTIONS: { value: ReminderChannel; label: string; icon: typeof Mail; soon?: boolean }[] = [
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { value: "SMS", label: "SMS", icon: Smartphone, soon: true },
];

function sampleStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 30, 0, 0);
  return d;
}

interface ReminderSettingsCardProps {
  form: UseFormReturn<ClinicSettingsFormValues>;
  /** `false` si el backend informa que no hay proveedor de email; `null` si no lo informa. */
  emailConfigured: boolean | null;
}

export function ReminderSettingsCard({ form, emailConfigured }: ReminderSettingsCardProps) {
  const {
    control,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = form;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [lastSecond, setLastSecond] = useState<number>(DEFAULT_SECOND_HOURS);

  const enabled = watch("remindersEnabled");
  const channels = watch("reminderChannels") ?? [];
  const template = watch("reminderTemplate");
  const clinicName = watch("name");
  const addressLine1 = watch("addressLine1");
  const addressLine2 = watch("addressLine2");

  const preview = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://tu-consultorio.com";
    const address = [addressLine1, addressLine2].map((x) => x?.trim()).filter(Boolean).join(", ");
    return renderReminderText({
      patientFirstName: "María",
      start: sampleStart(),
      medicShortName: "Dra. López",
      clinicName: clinicName?.trim() || null,
      address: address || null,
      confirmationLink: `${origin}/turno/ejemplo`,
      template,
    });
  }, [template, clinicName, addressLine1, addressLine2]);

  const unknownPlaceholders = useMemo(() => {
    // Mismo criterio que renderReminderText: {palabra} desconocida se reemplaza por "".
    const found = template?.match(/\{\w+\}/g) ?? [];
    return Array.from(new Set(found.filter((t) => !KNOWN_PLACEHOLDERS.has(t))));
  }, [template]);

  const missingLink = !!template?.trim() && !template.includes("{link}");

  function insertPlaceholder(token: string) {
    const el = textareaRef.current;
    const current = getValues("reminderTemplate") ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setValue("reminderTemplate", next, { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" /> Recordatorios de turnos
        </CardTitle>
        <CardDescription>
          Avisos a los pacientes antes de cada turno, con un link para confirmar o cancelar sin tener que llamar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Controller
          control={control}
          name="remindersEnabled"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Enviar recordatorios</span>
                <span className="block text-xs text-muted-foreground">
                  Si lo desactivás, no se generan ni se envían recordatorios nuevos.
                </span>
              </span>
              <Switch checked={!!field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />

        <fieldset disabled={!enabled} className={cn("space-y-6 transition-opacity", !enabled && "opacity-60")}>
          <legend className="sr-only">Opciones de recordatorios</legend>

          {/* ─── Anticipación ─────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rem-hours">Primer recordatorio</Label>
              <Controller
                control={control}
                name="reminderHoursBefore"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Input
                      id="rem-hours"
                      ref={field.ref}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={168}
                      className="w-24"
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
                      aria-invalid={!!errors.reminderHoursBefore}
                      aria-describedby="rem-hours-help"
                    />
                    <span className="text-sm text-muted-foreground">horas antes del turno</span>
                  </div>
                )}
              />
              {errors.reminderHoursBefore ? (
                <p className="text-xs text-destructive">{errors.reminderHoursBefore.message}</p>
              ) : (
                <p id="rem-hours-help" className="text-xs text-muted-foreground">
                  Entre 1 y 168 (7 días). Lo habitual es 24.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Controller
                control={control}
                name="reminderSecondHoursBefore"
                render={({ field }) => {
                  const on = field.value != null;
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="rem-second-on"
                          checked={on}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              field.onChange(lastSecond);
                            } else {
                              if (Number.isFinite(field.value)) setLastSecond(field.value as number);
                              field.onChange(null);
                            }
                          }}
                        />
                        <Label htmlFor="rem-second-on" className="cursor-pointer">
                          Segundo recordatorio
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id="rem-second-hours"
                          ref={field.ref}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={48}
                          className="w-24"
                          disabled={!on}
                          aria-label="Horas antes del turno del segundo recordatorio"
                          value={!on ? lastSecond : Number.isFinite(field.value) ? (field.value as number) : ""}
                          onBlur={field.onBlur}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))
                          }
                          aria-invalid={!!errors.reminderSecondHoursBefore}
                        />
                        <span className={cn("text-sm text-muted-foreground", !on && "opacity-60")}>horas antes</span>
                      </div>
                    </>
                  );
                }}
              />
              {errors.reminderSecondHoursBefore ? (
                <p className="text-xs text-destructive">{errors.reminderSecondHoursBefore.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Opcional, el mismo día (1 a 48 h). Ej.: 2 horas antes.</p>
              )}
            </div>
          </div>

          {/* ─── Canales ──────────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Canales</p>
            <Controller
              control={control}
              name="reminderChannels"
              render={({ field }) => {
                const value = field.value ?? [];
                return (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Canales de envío">
                    {CHANNEL_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const id = `rem-ch-${opt.value}`;
                      const checked = !opt.soon && value.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          htmlFor={id}
                          className={cn(
                            "flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm",
                            opt.soon ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                            checked && "border-primary/50 bg-primary/5",
                          )}
                        >
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={opt.soon}
                            onCheckedChange={(c) => {
                              const set = new Set(value);
                              if (c === true) set.add(opt.value);
                              else set.delete(opt.value);
                              field.onChange(REMINDER_CHANNELS.filter((ch) => set.has(ch)));
                            }}
                          />
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {opt.label}
                          {opt.soon && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                              próximamente
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                );
              }}
            />
            {errors.reminderChannels && (
              <p className="text-xs text-destructive">{errors.reminderChannels.message}</p>
            )}
            {channels.includes("WHATSAPP") && (
              <p className="text-xs text-muted-foreground">
                WhatsApp no se envía solo: queda en el panel de recepción con el mensaje listo (“Abrir WhatsApp”) y
                se marca como enviado.
              </p>
            )}
            {emailConfigured === false && channels.includes("EMAIL") && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  No hay un proveedor de email configurado en el servidor. Los recordatorios por email van a quedar
                  como fallidos (se ven en el panel de recepción) hasta que se configure{" "}
                  <code className="font-mono">EMAIL_PROVIDER</code> / <code className="font-mono">RESEND_API_KEY</code>{" "}
                  / <code className="font-mono">SMTP_HOST</code>.
                </span>
              </div>
            )}
          </div>

          {/* ─── Mensaje ──────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="rem-template">Mensaje</Label>
                {template?.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setValue("reminderTemplate", null, { shouldDirty: true, shouldValidate: true })}
                  >
                    <RotateCcw /> Usar el predeterminado
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setValue("reminderTemplate", DEFAULT_REMINDER_TEMPLATE, { shouldDirty: true, shouldValidate: true })
                    }
                  >
                    Editar el predeterminado
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Insertar dato en el mensaje">
                {REMINDER_PLACEHOLDERS.map((p) => (
                  <button
                    key={p.token}
                    type="button"
                    title={p.help}
                    onClick={() => insertPlaceholder(p.token)}
                    className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                  >
                    {p.token}
                  </button>
                ))}
              </div>
              <Controller
                control={control}
                name="reminderTemplate"
                render={({ field }) => (
                  <Textarea
                    id="rem-template"
                    ref={(el) => {
                      field.ref(el);
                      textareaRef.current = el;
                    }}
                    rows={7}
                    maxLength={TEMPLATE_MAX}
                    placeholder={DEFAULT_REMINDER_TEMPLATE}
                    value={field.value ?? ""}
                    onBlur={field.onBlur}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                    aria-invalid={!!errors.reminderTemplate}
                    aria-describedby="rem-template-help"
                    className="font-mono text-xs leading-relaxed"
                  />
                )}
              />
              <div className="flex items-start justify-between gap-3">
                <p id="rem-template-help" className="text-xs text-muted-foreground">
                  Tocá un dato para insertarlo. Vacío = mensaje predeterminado.
                </p>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {(template ?? "").length}/{TEMPLATE_MAX}
                </span>
              </div>
              {errors.reminderTemplate && (
                <p className="text-xs text-destructive">{errors.reminderTemplate.message}</p>
              )}
              {unknownPlaceholders.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {unknownPlaceholders.join(" ")} no {unknownPlaceholders.length === 1 ? "es un dato válido" : "son datos válidos"} y se va a quitar del mensaje.
                </p>
              )}
              {missingLink && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Sin <code className="font-mono">{"{link}"}</code> el paciente no puede confirmar ni cancelar desde el mensaje.
                </p>
              )}
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Por privacidad no agregues datos clínicos (motivo de consulta, estudios, diagnósticos): el mensaje
                solo debería llevar nombre de pila, fecha, hora, profesional y dirección.
              </p>
            </div>

            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Vista previa
              </p>
              <div className="rounded-xl bg-[#e7ddd3] p-3 dark:bg-muted/40">
                <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-relaxed text-[#111b21] shadow-sm dark:bg-emerald-900/60 dark:text-emerald-50">
                  <p className="whitespace-pre-wrap break-words">{preview}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Con datos de ejemplo. El email lleva el mismo texto y un botón para confirmar o cancelar.
              </p>
            </div>
          </div>
        </fieldset>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
