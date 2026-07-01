"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import {
  User as UserIcon,
  Briefcase,
  Bell,
  Globe,
  Lock,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  Award,
  Loader2,
  AlertCircle,
  Download,
  PencilLine,
} from "lucide-react";
import type { Specialization, UserNotifications, NotificationKey } from "@/types";

// ─── Profile (identity + professional info) ──────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, "Requerido").max(100),
  lastName: z.string().min(1, "Requerido").max(100),
  phone: z.string().max(40).optional().or(z.literal("")),
  specializationId: z.string().optional().or(z.literal("")),
  licenseNumber: z.string().max(50).optional().or(z.literal("")),
  officeAddress: z.string().max(200).optional().or(z.literal("")),
  bio: z.string().max(280, "Máximo 280 caracteres").optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

type ProfileData = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  officeAddress: string | null;
  bio: string | null;
  licenseNumber: string | null;
  specializationId: string | null;
  specialization: { id: string; name: string } | null;
  isActive: boolean;
};

function ProfileCards({ isMedicRole }: { isMedicRole: boolean }) {
  const { data: session, update } = useSession();
  const user = session?.user;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [specializations, setSpecializations] = useState<Specialization[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      specializationId: "",
      licenseNumber: "",
      officeAddress: "",
      bio: "",
    },
  });

  const bio = watch("bio") ?? "";

  useEffect(() => {
    async function load() {
      try {
        const [profRes, specRes] = await Promise.all([
          fetch("/api/user/profile"),
          fetch("/api/specializations"),
        ]);
        if (profRes.ok) {
          const { data } = await profRes.json();
          setProfile(data);
          reset({
            firstName: data.firstName ?? "",
            lastName: data.lastName ?? "",
            phone: data.phone ?? "",
            specializationId: data.specializationId ?? "",
            licenseNumber: data.licenseNumber ?? "",
            officeAddress: data.officeAddress ?? "",
            bio: data.bio ?? "",
          });
        }
        if (specRes.ok) {
          const json = await specRes.json();
          setSpecializations(json.data ?? []);
        }
      } catch {
        toast.error("Error al cargar el perfil");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reset]);

  async function onSubmit(values: ProfileFormValues) {
    try {
      const payload = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || null,
        specializationId: values.specializationId || null,
        licenseNumber: values.licenseNumber || null,
        officeAddress: values.officeAddress || null,
        bio: values.bio || null,
      };
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al actualizar");
      }
      const { data } = await res.json();
      setProfile((p) => (p ? { ...p, ...data } : p));
      await update({
        name: data.name ?? `${values.firstName} ${values.lastName}`.trim(),
      });
      reset(values);
      toast.success("Perfil actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al actualizar");
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

  const fullName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || user?.name || "Sin nombre";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* ─── Identidad ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            Identidad
          </CardTitle>
          <CardDescription>
            Esto es lo que ven tus pacientes en confirmaciones y recordatorios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <UserAvatar name={fullName} image={user?.image} className="h-20 w-20 text-2xl" />
            <div className="min-w-0 flex-1">
              <h4 className="text-lg font-semibold">{isMedicRole ? `Dr/a. ${fullName}` : fullName}</h4>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile?.specialization?.name && (
                  <Badge variant="default" className="bg-primary/15 text-primary hover:bg-primary/20">
                    {profile.specialization.name}
                  </Badge>
                )}
                {profile?.licenseNumber && (
                  <Badge variant="secondary">{profile.licenseNumber}</Badge>
                )}
                {profile?.isActive && (
                  <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-400">
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Activo
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nombre</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Apellido</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" value={user?.email ?? ""} readOnly className="bg-muted pl-9" />
              </div>
              <p className="text-xs text-muted-foreground">
                El email no se puede cambiar desde acá.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="phone" placeholder="+54 11 4823 5512" className="pl-9" {...register("phone")} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Información profesional ────────────────────────────────────── */}
      {isMedicRole && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Información profesional
            </CardTitle>
            <CardDescription>
              Datos que aparecen en recetas, certificados y la ficha pública.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="specialization">Especialidad</Label>
                <Select
                  value={watch("specializationId") || undefined}
                  onValueChange={(v) =>
                    setValue("specializationId", v, { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="specialization">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {specializations.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="licenseNumber">
                  Matrícula <span className="text-muted-foreground">(MN / MP)</span>
                </Label>
                <div className="relative">
                  <Award className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="licenseNumber"
                    placeholder="MN 158.224"
                    className="pl-9"
                    {...register("licenseNumber")}
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="officeAddress">Dirección del consultorio</Label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="officeAddress"
                    placeholder="Av. Santa Fe 1234, Piso 4 — CABA"
                    className="pl-9"
                    {...register("officeAddress")}
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bio">
                  Biografía profesional{" "}
                  <span className="text-muted-foreground">— máx. 280 caracteres</span>
                </Label>
                <Textarea
                  id="bio"
                  rows={3}
                  maxLength={280}
                  placeholder="Médico cardiólogo con orientación en cardiología clínica…"
                  {...register("bio")}
                />
                <p className="text-right text-xs text-muted-foreground">{bio.length} / 280</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single save button for both identity + professional cards */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar perfil
        </Button>
      </div>
    </form>
  );
}

// ─── Notifications card ──────────────────────────────────────────────────────

const NOTIFICATIONS_META: { key: NotificationKey; title: string; desc: string }[] = [
  { key: "notifyReminder24h", title: "Recordatorio 24 h antes", desc: "Email + WhatsApp al paciente el día previo al turno." },
  { key: "notifyReminder2h", title: "Recordatorio 2 h antes", desc: "Mensaje corto al paciente próximo a su horario." },
  { key: "notifyNewShift", title: "Nuevos turnos", desc: "Avisarte cuando reservan un turno desde el portal." },
  { key: "notifyCancellation", title: "Cancelaciones", desc: "Avisarte cuando un paciente cancela o reprograma." },
  { key: "notifyWeeklySummary", title: "Resumen semanal", desc: "Email los lunes con turnos y métricas de la semana." },
  { key: "notifySmsFallback", title: "Permitir SMS al paciente", desc: "Fallback por SMS si el WhatsApp no se entrega." },
];

function NotificationsCard() {
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState<UserNotifications | null>(null);
  const [savingKey, setSavingKey] = useState<NotificationKey | null>(null);

  useEffect(() => {
    fetch("/api/user/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ data }) => setNotifs(data))
      .catch(() => toast.error("Error al cargar notificaciones"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = useCallback(
    async (key: NotificationKey) => {
      if (!notifs) return;
      const newValue = !notifs[key];
      const previous = notifs;
      setNotifs({ ...notifs, [key]: newValue });
      setSavingKey(key);
      try {
        const res = await fetch("/api/user/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: newValue }),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast.error("No se pudo guardar el cambio");
        setNotifs(previous);
      } finally {
        setSavingKey(null);
      }
    },
    [notifs]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notificaciones
        </CardTitle>
        <CardDescription>
          Elegí qué te avisamos y qué le mandamos a tus pacientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-2">
        {loading || !notifs ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          NOTIFICATIONS_META.map((n) => (
            <div
              key={n.key}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.desc}</p>
              </div>
              <Switch
                checked={notifs[n.key]}
                onCheckedChange={() => toggle(n.key)}
                disabled={savingKey === n.key}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ─── Regional preferences ────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "es-AR", label: "Español (Argentina)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "es-MX", label: "Español (México)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
];

const TIMEZONES = [
  { value: "America/Argentina/Buenos_Aires", label: "(GMT-3) Buenos Aires" },
  { value: "America/Sao_Paulo", label: "(GMT-3) São Paulo" },
  { value: "America/Santiago", label: "(GMT-3) Santiago" },
  { value: "America/Mexico_City", label: "(GMT-6) Ciudad de México" },
];

function RegionalCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState("es-AR");
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [weekStart, setWeekStart] = useState("1");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/user/preferences-config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ data }) => {
        setLanguage(data.language ?? "es-AR");
        setTimezone(data.timezone ?? "America/Argentina/Buenos_Aires");
        setWeekStart(String(data.weekStart ?? 1));
      })
      .catch(() => toast.error("Error al cargar preferencias"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/preferences-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          timezone,
          weekStart: Number(weekStart),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Preferencias guardadas");
      setDirty(false);
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Preferencias regionales
        </CardTitle>
        <CardDescription>Idioma, zona horaria y formato de la app.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select
                value={language}
                onValueChange={(v) => {
                  setLanguage(v);
                  setDirty(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Zona horaria</Label>
              <Select
                value={timezone}
                onValueChange={(v) => {
                  setTimezone(v);
                  setDirty(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Inicio de semana</Label>
              <Select
                value={weekStart}
                onValueChange={(v) => {
                  setWeekStart(v);
                  setDirty(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Lunes</SelectItem>
                  <SelectItem value="0">Domingo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end sm:col-span-3">
              <Button type="button" disabled={!dirty || saving} onClick={save}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Security (change password) ──────────────────────────────────────────────

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Contraseña actual requerida"),
    newPassword: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/[A-Z]/, "Debe contener una mayúscula")
      .regex(/[0-9]/, "Debe contener un número"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

function SecurityCard() {
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  async function onSubmit(values: PasswordFormValues) {
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al cambiar la contraseña");
      }
      toast.success("Contraseña actualizada");
      reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Seguridad
          </CardTitle>
          <CardDescription>Cambiá tu contraseña de acceso.</CardDescription>
        </div>
        {!open && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <PencilLine className="mr-1.5 h-4 w-4" />
            Cambiar contraseña
          </Button>
        )}
      </CardHeader>
      {open && (
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Contraseña actual</Label>
                <Input type="password" {...register("currentPassword")} />
                {errors.currentPassword && (
                  <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Nueva contraseña</Label>
                <Input type="password" {...register("newPassword")} />
                {errors.newPassword && (
                  <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar nueva</Label>
                <Input type="password" {...register("confirmPassword")} />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Mínimo 8 caracteres, una mayúscula y un número.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Actualizar contraseña
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Danger zone (export only) ───────────────────────────────────────────────

function DangerZoneCard() {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/user/export");
      if (!res.ok) throw new Error("Falló la exportación");
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const fileMatch = cd.match(/filename="([^"]+)"/);
      const filename = fileMatch?.[1] ?? `consultorio-export-${new Date().toISOString().split("T")[0]}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Datos exportados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="border-amber-200 dark:border-amber-900/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          Zona crítica
        </CardTitle>
        <CardDescription>Acciones de exportación de datos.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">Exportar mis datos</p>
            <p className="text-xs text-muted-foreground">
              Descargá un JSON con tu perfil, pacientes, turnos, recetas y órdenes de estudio.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Entry component ─────────────────────────────────────────────────────────

export function ProfileTab({ isMedicRole }: { isMedicRole: boolean }) {
  return (
    <div className="space-y-4">
      <ProfileCards isMedicRole={isMedicRole} />
      <NotificationsCard />
      <RegionalCard />
      <SecurityCard />
      <DangerZoneCard />
    </div>
  );
}
