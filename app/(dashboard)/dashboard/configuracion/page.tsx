"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Plus,
  X,
  CalendarIcon,
  CalendarRange,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { format, eachDayOfInterval, isAfter, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { UserPreference, BlockDay, HealthInsurance } from "@/types";
import { DAY_NAMES } from "@/types";
import type { DateRange } from "react-day-picker";

// ─── Time Select Component ──────────────────────────────────────────────────

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07 to 21
const MINUTES = ["00", "15", "30", "45"];

function TimeSelect({
  value,
  onChange,
  disabled,
  placeholder = "Hora",
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const options: string[] = [];
  for (const h of HOURS) {
    for (const m of MINUTES) {
      options.push(`${String(h).padStart(2, "0")}:${m}`);
    }
  }

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-[100px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-xs">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Profile Section ─────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function ProfileSection() {
  const { data: session, update } = useSession();
  const user = session?.user;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? "",
    },
  });

  async function onSubmit(values: ProfileFormValues) {
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al actualizar el perfil");
      }

      await update({ name: values.name });
      toast.success("Perfil actualizado correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar"
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>Actualiza tu informacion personal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <UserAvatar
            name={user?.name}
            image={user?.image}
            className="h-16 w-16 text-lg"
          />
          <div>
            <p className="font-medium">{user?.name ?? "Sin nombre"}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <Separator />

        <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              placeholder="Tu nombre completo"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={user?.email ?? ""}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              El email no se puede cambiar desde aqui.
            </p>
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Change Password Section ────────────────────────────────────────────────

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "La contrasena actual es requerida"),
    newPassword: z
      .string()
      .min(8, "La contrasena debe tener al menos 8 caracteres")
      .regex(/[A-Z]/, "Debe contener al menos una mayuscula")
      .regex(/[0-9]/, "Debe contener al menos un numero"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

function ChangePasswordSection() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  async function onSubmit(values: ChangePasswordFormValues) {
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al cambiar la contrasena");
      }

      toast.success("Contrasena actualizada correctamente");
      reset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al cambiar la contrasena"
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar Contrasena</CardTitle>
        <CardDescription>
          Actualiza tu contrasena de acceso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Contrasena actual</Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              className={
                errors.currentPassword
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nueva contrasena</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              className={
                errors.newPassword
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nueva contrasena</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              className={
                errors.confirmPassword
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
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

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Cambiando..." : "Cambiar Contrasena"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Work Hours Section ──────────────────────────────────────────────────────

interface DayPreference {
  day: number;
  enabled: boolean;
  fromHourAM: string;
  toHourAM: string;
  fromHourPM: string;
  toHourPM: string;
}

function WorkHoursSection() {
  const { data: session } = useSession();
  const [preferences, setPreferences] = useState<DayPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/preferences");
        if (res.ok) {
          const json = await res.json();
          const data: UserPreference[] =
            json.data?.preferences ?? json.data ?? [];
          const mapped: DayPreference[] = [];
          for (let d = 0; d < 7; d++) {
            const existing = data.find((p) => p.day === d);
            const hasAnyHour =
              !!existing?.fromHourAM ||
              !!existing?.toHourAM ||
              !!existing?.fromHourPM ||
              !!existing?.toHourPM;
            mapped.push({
              day: d,
              enabled: hasAnyHour,
              fromHourAM: existing?.fromHourAM ?? "",
              toHourAM: existing?.toHourAM ?? "",
              fromHourPM: existing?.fromHourPM ?? "",
              toHourPM: existing?.toHourPM ?? "",
            });
          }
          setPreferences(mapped);
        } else {
          setPreferences(
            Array.from({ length: 7 }, (_, d) => ({
              day: d,
              enabled: d >= 1 && d <= 5, // Mon-Fri enabled by default
              fromHourAM: "",
              toHourAM: "",
              fromHourPM: "",
              toHourPM: "",
            }))
          );
        }
      } catch {
        toast.error("Error al cargar horarios");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleDay(day: number) {
    setPreferences((prev) =>
      prev.map((p) =>
        p.day === day
          ? {
              ...p,
              enabled: !p.enabled,
              // Clear times when disabling
              ...(!p.enabled
                ? {}
                : {
                    fromHourAM: "",
                    toHourAM: "",
                    fromHourPM: "",
                    toHourPM: "",
                  }),
            }
          : p
      )
    );
  }

  function updatePref(
    day: number,
    field: keyof DayPreference,
    value: string
  ) {
    setPreferences((prev) =>
      prev.map((p) => (p.day === day ? { ...p, [field]: value } : p))
    );
  }

  async function savePreferences() {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      toast.error("No se pudo obtener el usuario");
      return;
    }

    // Validate from < to
    for (const pref of preferences) {
      if (!pref.enabled) continue;
      if (pref.fromHourAM && pref.toHourAM && pref.fromHourAM >= pref.toHourAM) {
        toast.error(
          `${DAY_NAMES[pref.day]}: hora inicio manana debe ser menor que fin`
        );
        return;
      }
      if (pref.fromHourPM && pref.toHourPM && pref.fromHourPM >= pref.toHourPM) {
        toast.error(
          `${DAY_NAMES[pref.day]}: hora inicio tarde debe ser menor que fin`
        );
        return;
      }
    }

    const cleanPrefs = preferences.map((p) => ({
      day: p.day,
      fromHourAM: p.enabled && p.fromHourAM ? p.fromHourAM : null,
      toHourAM: p.enabled && p.toHourAM ? p.toHourAM : null,
      fromHourPM: p.enabled && p.fromHourPM ? p.fromHourPM : null,
      toHourPM: p.enabled && p.toHourPM ? p.toHourPM : null,
    }));

    try {
      setSaving(true);
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, preferences: cleanPrefs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar");
      }
      toast.success("Horarios guardados correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al guardar los horarios"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horarios de Atencion</CardTitle>
        <CardDescription>
          Activa los dias que trabajas y configura los horarios de manana y
          tarde.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {preferences.map((pref) => (
            <div
              key={pref.day}
              className={`rounded-lg border p-3 transition-colors ${
                pref.enabled
                  ? "border-border bg-card"
                  : "border-dashed border-muted bg-muted/30"
              }`}
            >
              {/* Day toggle row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={() => toggleDay(pref.day)}
                  />
                  <span
                    className={`text-sm font-medium ${
                      pref.enabled ? "" : "text-muted-foreground"
                    }`}
                  >
                    {DAY_NAMES[pref.day]}
                  </span>
                </div>
                {!pref.enabled && (
                  <span className="text-xs text-muted-foreground">
                    No atiende
                  </span>
                )}
              </div>

              {/* Time selectors — only when enabled */}
              {pref.enabled && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* AM */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Manana
                    </p>
                    <div className="flex items-center gap-2">
                      <TimeSelect
                        value={pref.fromHourAM}
                        onChange={(v) =>
                          updatePref(pref.day, "fromHourAM", v)
                        }
                        placeholder="Desde"
                      />
                      <span className="text-xs text-muted-foreground">a</span>
                      <TimeSelect
                        value={pref.toHourAM}
                        onChange={(v) =>
                          updatePref(pref.day, "toHourAM", v)
                        }
                        placeholder="Hasta"
                      />
                    </div>
                  </div>
                  {/* PM */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Tarde
                    </p>
                    <div className="flex items-center gap-2">
                      <TimeSelect
                        value={pref.fromHourPM}
                        onChange={(v) =>
                          updatePref(pref.day, "fromHourPM", v)
                        }
                        placeholder="Desde"
                      />
                      <span className="text-xs text-muted-foreground">a</span>
                      <TimeSelect
                        value={pref.toHourPM}
                        onChange={(v) =>
                          updatePref(pref.day, "toHourPM", v)
                        }
                        placeholder="Hasta"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <Button onClick={savePreferences} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar Horarios
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Block Days Section ──────────────────────────────────────────────────────

interface RescheduledShift {
  shiftId: string;
  patient: string;
  originalDate: string;
  newDate: string;
  originalTime: string;
}

function BlockDaysSection() {
  const { data: session } = useSession();
  const [blockDays, setBlockDays] = useState<BlockDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rescheduledShifts, setRescheduledShifts] = useState<RescheduledShift[]>([]);
  const [showRescheduledDialog, setShowRescheduledDialog] = useState(false);

  useEffect(() => {
    fetchBlockDays();
  }, []);

  async function fetchBlockDays() {
    try {
      setLoading(true);
      const res = await fetch("/api/preferences");
      if (res.ok) {
        const json = await res.json();
        const days = json.data?.blockDays ?? [];
        setBlockDays(Array.isArray(days) ? days : []);
      }
    } catch {
      toast.error("Error al cargar dias bloqueados");
    } finally {
      setLoading(false);
    }
  }

  async function addBlockDays() {
    if (!dateRange?.from) {
      toast.error("Selecciona al menos una fecha");
      return;
    }

    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      toast.error("No se pudo obtener el usuario");
      return;
    }

    // Build array of dates (single date or range)
    const from = startOfDay(dateRange.from);
    const to = dateRange.to ? startOfDay(dateRange.to) : from;

    if (isBefore(to, from)) {
      toast.error("La fecha de fin debe ser posterior a la de inicio");
      return;
    }

    const dates = eachDayOfInterval({ start: from, end: to }).map((d) =>
      format(d, "yyyy-MM-dd")
    );

    try {
      setAdding(true);
      const res = await fetch("/api/preferences/block-days", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, dates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al agregar dias bloqueados");
      }
      const resJson = await res.json();
      const rescheduled: RescheduledShift[] = resJson.data?.rescheduledShifts ?? [];

      if (rescheduled.length > 0) {
        setRescheduledShifts(rescheduled);
        setShowRescheduledDialog(true);
        toast.success(
          `Dias bloqueados. ${rescheduled.length} turno(s) reprogramado(s) automaticamente.`
        );
      } else {
        toast.success(
          dates.length === 1
            ? "Dia bloqueado agregado"
            : `${dates.length} dias bloqueados agregados`
        );
      }
      setDateRange(undefined);
      setCalendarOpen(false);
      fetchBlockDays();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al agregar"
      );
    } finally {
      setAdding(false);
    }
  }

  async function removeBlockDay(id: string) {
    if (!id) return;
    try {
      const res = await fetch("/api/preferences/block-days", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Error al eliminar");
      toast.success("Dia bloqueado eliminado");
      setBlockDays((prev) => prev.filter((b) => b.id !== id));
    } catch {
      toast.error("Error al eliminar el dia bloqueado");
    }
  }

  function formatDateTime(isoStr: string): string {
    const d = new Date(isoStr);
    return format(d, "EEEE d/MM/yyyy", { locale: es });
  }

  // Dates already blocked (to gray them out in calendar)
  const blockedDates = blockDays.map((b) => new Date(b.date));

  const rangeLabel = dateRange?.from
    ? dateRange.to && !isSameDay(dateRange.from, dateRange.to)
      ? `${format(dateRange.from, "dd/MM/yyyy", { locale: es })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: es })}`
      : format(dateRange.from, "dd/MM/yyyy", { locale: es })
    : "Seleccionar fecha o rango";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dias Bloqueados</CardTitle>
        <CardDescription>
          Bloquea fechas puntuales o rangos (vacaciones, feriados, congresos).
          Podes seleccionar un dia o un rango de fechas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date range picker */}
        <div className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Fecha o rango</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={`w-full justify-start text-left font-normal ${
                    !dateRange?.from ? "text-muted-foreground" : ""
                  }`}
                >
                  <CalendarRange className="mr-2 h-4 w-4" />
                  {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={es}
                  disabled={(date) =>
                    isBefore(date, startOfDay(new Date())) ||
                    blockedDates.some((bd) => isSameDay(bd, date))
                  }
                  defaultMonth={new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button
            onClick={addBlockDays}
            disabled={adding || !dateRange?.from}
            size="default"
          >
            {adding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Bloquear
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : blockDays.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay dias bloqueados.
          </p>
        ) : (
          <div className="max-w-lg space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {blockDays.length}{" "}
              {blockDays.length === 1 ? "dia bloqueado" : "dias bloqueados"}
            </p>
            {blockDays
              .sort(
                (a, b) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime()
              )
              .map((bd) => (
                <div
                  key={bd.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">
                      {format(new Date(bd.date), "EEEE, d 'de' MMMM yyyy", {
                        locale: es,
                      })}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeBlockDay(bd.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      {/* Rescheduled shifts dialog */}
      <Dialog open={showRescheduledDialog} onOpenChange={setShowRescheduledDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              Turnos reprogramados
            </DialogTitle>
            <DialogDescription>
              Se reprogramaron {rescheduledShifts.length} turno(s) automaticamente
              para evitar conflictos con los dias bloqueados.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {rescheduledShifts.map((rs) => (
              <div
                key={rs.shiftId}
                className="rounded-lg border p-3 space-y-1"
              >
                <p className="text-sm font-medium">{rs.patient}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDateTime(rs.originalDate)} {rs.originalTime}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-primary">
                    {formatDateTime(rs.newDate)} {rs.originalTime}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRescheduledDialog(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Obras Sociales Section ─────────────────────────────────────────────────

function InsuranceSection() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const [allInsurances, setAllInsurances] = useState<HealthInsurance[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      try {
        const [allRes, userRes] = await Promise.all([
          fetch("/api/health-insurance"),
          fetch(`/api/users/${userId}/insurances`),
        ]);

        if (allRes.ok) {
          const allJson = await allRes.json();
          setAllInsurances(allJson.data ?? []);
        }

        if (userRes.ok) {
          const userJson = await userRes.json();
          const accepted: HealthInsurance[] = userJson.data ?? [];
          setSelectedIds(new Set(accepted.map((ins) => ins.id)));
        }
      } catch {
        toast.error("Error al cargar obras sociales");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  function toggleInsurance(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(allInsurances.map((ins) => ins.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  async function saveInsurances() {
    if (!userId) {
      toast.error("No se pudo obtener el usuario");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/users/${userId}/insurances`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insuranceIds: Array.from(selectedIds) }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar");
      }

      toast.success("Obras sociales guardadas correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar obras sociales"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Obras Sociales Aceptadas
        </CardTitle>
        <CardDescription>
          Selecciona las obras sociales que aceptas. Si no seleccionas ninguna,
          se asumira que aceptas todas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Seleccionar todas
          </Button>
          <Button variant="outline" size="sm" onClick={selectNone}>
            Deseleccionar todas
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {allInsurances.map((ins) => (
            <label
              key={ins.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                selectedIds.has(ins.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={selectedIds.has(ins.id)}
                onCheckedChange={() => toggleInsurance(ins.id)}
              />
              <div>
                <span className="text-sm font-medium">{ins.name}</span>
                {ins.code && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({ins.code})
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>

        {allInsurances.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay obras sociales registradas.
          </p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {selectedIds.size} de {allInsurances.length} seleccionadas
          </p>
          <Button onClick={saveInsurances} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string | null } | undefined)?.role;
  const isMedicRole = userRole === "medic";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuracion</h1>
        <p className="text-muted-foreground">
          Gestiona tu perfil y preferencias de atencion
        </p>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          {isMedicRole && (
            <>
              <TabsTrigger value="horarios">Horarios</TabsTrigger>
              <TabsTrigger value="bloqueos">Dias Bloqueados</TabsTrigger>
              <TabsTrigger value="obras-sociales">Obras Sociales</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="perfil" className="mt-6 space-y-6">
          <ProfileSection />
          <ChangePasswordSection />
        </TabsContent>

        {isMedicRole && (
          <>
            <TabsContent value="horarios" className="mt-6">
              <WorkHoursSection />
            </TabsContent>

            <TabsContent value="bloqueos" className="mt-6">
              <BlockDaysSection />
            </TabsContent>

            <TabsContent value="obras-sociales" className="mt-6">
              <InsuranceSection />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
