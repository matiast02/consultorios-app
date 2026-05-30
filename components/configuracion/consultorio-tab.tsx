"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Inbox, Settings, Clock as ClockIcon, MessageCircle, Check, Archive, Mail, Phone, MapPin } from "lucide-react";
import { ClinicLocationPicker, type LocationValue } from "./clinic-location-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clinicSettingsSchema, clinicHoursWeekSchema, type ClinicSettingsInput } from "@/lib/validations";
import type { ClinicHoursDay, ClinicSettings, ClinicContactRequest } from "@/types";
import { dayLongLabel } from "@/lib/clinic-hours-format";
import { buildWhatsappLink } from "@/lib/whatsapp";

// ────────────────────────────────────────────────────────────────────────────
// Settings sub-card
// ────────────────────────────────────────────────────────────────────────────

function SettingsCard() {
  const [loading, setLoading] = useState(true);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ClinicSettingsInput>({
    resolver: zodResolver(clinicSettingsSchema),
    defaultValues: {
      name: "",
      tagline: "",
      contactEmail: "",
      whatsappPrimary: "",
      whatsappSecondary: "",
      phoneDisplay: "",
      prefillWhatsappMessage: "",
      addressLine1: "",
      addressLine2: "",
      mapLat: null,
      mapLng: null,
      mapZoom: 16,
      showTeam: true,
      showHours: true,
      showMap: true,
      showContactForm: true,
      yearsOfService: null,
      patientsServedDisplay: "",
    },
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/clinic-settings")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const s: ClinicSettings = j.data;
        reset({
          name: s.name ?? "",
          tagline: s.tagline ?? "",
          contactEmail: s.contactEmail ?? "",
          whatsappPrimary: s.whatsappPrimary ?? "",
          whatsappSecondary: s.whatsappSecondary ?? "",
          phoneDisplay: s.phoneDisplay ?? "",
          prefillWhatsappMessage: s.prefillWhatsappMessage ?? "",
          addressLine1: s.addressLine1 ?? "",
          addressLine2: s.addressLine2 ?? "",
          mapLat: s.mapLat,
          mapLng: s.mapLng,
          mapZoom: s.mapZoom ?? 16,
          showTeam: s.showTeam,
          showHours: s.showHours,
          showMap: s.showMap,
          showContactForm: s.showContactForm,
          yearsOfService: s.yearsOfService,
          patientsServedDisplay: s.patientsServedDisplay ?? "",
        });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reset]);

  async function onSubmit(values: ClinicSettingsInput) {
    try {
      const res = await fetch("/api/admin/clinic-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Error al guardar");
        return;
      }
      toast.success("Configuración actualizada");
      reset(values);
    } catch {
      toast.error("Error de conexión");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" /> Datos del consultorio
        </CardTitle>
        <CardDescription>
          Información que se muestra en el sitio público. Todos los campos son opcionales — solo se muestra lo cargado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-name">Nombre del consultorio</Label>
                <Input id="cs-name" placeholder="ConsultorioApp" {...register("name")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-tagline">Tagline corto</Label>
                <Input id="cs-tagline" placeholder="Centro médico" {...register("tagline")} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-email">Email de contacto</Label>
                <Input id="cs-email" type="email" placeholder="turnos@consultorio.com" {...register("contactEmail")} />
                {errors.contactEmail && (
                  <p className="text-xs text-destructive">{errors.contactEmail.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-phone">Teléfono visible</Label>
                <Input id="cs-phone" placeholder="+54 11 4000-1234" {...register("phoneDisplay")} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-wa1">WhatsApp principal</Label>
                <Input id="cs-wa1" inputMode="numeric" placeholder="5491140001234 (sólo dígitos)" {...register("whatsappPrimary")} />
                {errors.whatsappPrimary && (
                  <p className="text-xs text-destructive">{errors.whatsappPrimary.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-wa2">WhatsApp secundario (opcional)</Label>
                <Input id="cs-wa2" inputMode="numeric" placeholder="5491140005678" {...register("whatsappSecondary")} />
                {errors.whatsappSecondary && (
                  <p className="text-xs text-destructive">{errors.whatsappSecondary.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cs-greet">Saludo prellenado de WhatsApp</Label>
              <Textarea
                id="cs-greet"
                rows={2}
                placeholder="Hola, quería solicitar un turno"
                {...register("prefillWhatsappMessage")}
              />
              <p className="text-xs text-muted-foreground">
                El sistema agrega el nombre, especialidad y día preferido del visitante a este saludo.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-addr1">Dirección (línea 1)</Label>
                <Input id="cs-addr1" placeholder="Av. Corrientes 1234, piso 3" {...register("addressLine1")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-addr2">Dirección (línea 2)</Label>
                <Input id="cs-addr2" placeholder="Ciudad Autónoma de Buenos Aires" {...register("addressLine2")} />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Ubicación en el mapa</p>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Buscá tu dirección y arrastrá el pin para marcar la entrada exacta del consultorio.
              </p>
              <Controller
                control={control}
                name="mapLat"
                render={({ field: latField }) => (
                  <Controller
                    control={control}
                    name="mapLng"
                    render={({ field: lngField }) => (
                      <Controller
                        control={control}
                        name="mapZoom"
                        render={({ field: zoomField }) => {
                          const current: LocationValue | null =
                            latField.value != null && lngField.value != null
                              ? {
                                  lat: latField.value,
                                  lng: lngField.value,
                                  zoom: zoomField.value ?? 16,
                                  label: null,
                                }
                              : null;
                          return (
                            <ClinicLocationPicker
                              value={current}
                              onChange={(v) => {
                                latField.onChange(v?.lat ?? null);
                                lngField.onChange(v?.lng ?? null);
                                zoomField.onChange(v?.zoom ?? null);
                              }}
                            />
                          );
                        }}
                      />
                    )}
                  />
                )}
              />
              {(errors.mapLat || errors.mapLng) && (
                <p className="mt-2 text-xs text-destructive">
                  {errors.mapLat?.message ?? errors.mapLng?.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-years">Años de trayectoria (stat)</Label>
                <Controller
                  control={control}
                  name="yearsOfService"
                  render={({ field }) => (
                    <Input
                      id="cs-years"
                      type="number"
                      min={0}
                      placeholder="15"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-patients">Pacientes atendidos (stat)</Label>
                <Input id="cs-patients" placeholder="+12k" {...register("patientsServedDisplay")} />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-semibold">Visibilidad en el sitio público</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchRow control={control} name="showTeam" label="Sección Equipo" />
                <SwitchRow control={control} name="showHours" label="Sección Horarios" />
                <SwitchRow control={control} name="showMap" label="Mapa de ubicación" />
                <SwitchRow control={control} name="showContactForm" label="Formulario de contacto" />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Button type="submit" disabled={isSubmitting || !isDirty}>
                {isSubmitting ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<ClinicSettingsInput>>["control"];
  name: "showTeam" | "showHours" | "showMap" | "showContactForm";
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-background px-3 py-2.5">
          <span className="text-sm font-medium">{label}</span>
          <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
        </label>
      )}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Hours sub-card
// ────────────────────────────────────────────────────────────────────────────

function HoursCard() {
  const [days, setDays] = useState<ClinicHoursDay[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/clinic-hours")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setDays(j.data);
      })
      .catch(() => toast.error("No pudimos cargar los horarios"));
  }, []);

  function update(dow: number, patch: Partial<ClinicHoursDay>) {
    setDays((prev) =>
      prev ? prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)) : prev
    );
  }

  function copyMondayToWeekdays() {
    if (!days) return;
    const lun = days.find((d) => d.dayOfWeek === 0);
    if (!lun) return;
    setDays((prev) =>
      prev
        ? prev.map((d) =>
            d.dayOfWeek >= 1 && d.dayOfWeek <= 4
              ? {
                  ...d,
                  closed: lun.closed,
                  amOpen: lun.amOpen,
                  amClose: lun.amClose,
                  pmOpen: lun.pmOpen,
                  pmClose: lun.pmClose,
                }
              : d
          )
        : prev
    );
    toast.success("Lunes copiado a Martes–Viernes");
  }

  async function save() {
    if (!days) return;
    const payload = days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      closed: d.closed,
      amOpen: d.amOpen || null,
      amClose: d.amClose || null,
      pmOpen: d.pmOpen || null,
      pmClose: d.pmClose || null,
    }));
    const parsed = clinicHoursWeekSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      toast.error(`Día ${(first.path[0] as number) + 1}: ${first.message}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/clinic-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Error al guardar");
      } else {
        toast.success("Horarios actualizados");
        setDays(json.data);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-primary" /> Horarios del consultorio
        </CardTitle>
        <CardDescription>
          Horario general que se muestra en la home. Cada día puede tener un turno mañana y/o tarde.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {days == null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="space-y-3">
            {days.map((d) => (
              <div
                key={d.dayOfWeek}
                className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[120px_auto_1fr_1fr]"
              >
                <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-2">
                  <span className="text-sm font-semibold">{dayLongLabel(d.dayOfWeek)}</span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={d.closed}
                      onCheckedChange={(v) => update(d.dayOfWeek, { closed: v })}
                    />
                    Cerrado
                  </label>
                </div>
                <div className="hidden sm:block" />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Mañana</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={d.amOpen ?? ""}
                      disabled={d.closed}
                      onChange={(e) => update(d.dayOfWeek, { amOpen: e.target.value || null })}
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="time"
                      value={d.amClose ?? ""}
                      disabled={d.closed}
                      onChange={(e) => update(d.dayOfWeek, { amClose: e.target.value || null })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tarde</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={d.pmOpen ?? ""}
                      disabled={d.closed}
                      onChange={(e) => update(d.dayOfWeek, { pmOpen: e.target.value || null })}
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="time"
                      value={d.pmClose ?? ""}
                      disabled={d.closed}
                      onChange={(e) => update(d.dayOfWeek, { pmClose: e.target.value || null })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={copyMondayToWeekdays}>
                Copiar Lunes a Mar–Vie
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar horarios"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Inbox sub-card
// ────────────────────────────────────────────────────────────────────────────

function InboxCard() {
  const [items, setItems] = useState<ClinicContactRequest[] | null>(null);
  const [filter, setFilter] = useState<"new" | "all" | "archived">("new");

  const refresh = useCallback(() => {
    fetch(`/api/admin/contact-requests?status=${filter}`)
      .then((r) => r.json())
      .then((j) => j?.success && setItems(j.data))
      .catch(() => toast.error("No pudimos cargar las solicitudes"));
  }, [filter]);

  useEffect(() => {
    setItems(null);
    refresh();
  }, [refresh]);

  async function patch(id: string, body: { status?: "new" | "read" | "archived"; whatsappOpened?: boolean }) {
    const res = await fetch(`/api/admin/contact-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Error al actualizar");
      return;
    }
    refresh();
  }

  function openWhatsapp(r: ClinicContactRequest) {
    if (!r.phone) return;
    const link = buildWhatsappLink(r.phone, `Hola ${r.fullName}, te respondo por tu solicitud de turno.`);
    window.open(link, "_blank", "noopener,noreferrer");
    patch(r.id, { whatsappOpened: true });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" /> Solicitudes recibidas
            </CardTitle>
            <CardDescription>
              Mensajes enviados desde el formulario público del sitio.
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            {(["new", "all", "archived"] as const).map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f === "new" ? "Nuevas" : f === "all" ? "Todas" : "Archivadas"}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items == null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay solicitudes que mostrar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Especialidad / Día</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge
                        variant={r.status === "new" ? "default" : r.status === "read" ? "secondary" : "outline"}
                        className="capitalize"
                      >
                        {r.status === "new" ? "nueva" : r.status === "read" ? "leída" : "archivada"}
                      </Badge>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("es-AR")}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold">{r.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        <a className="hover:underline" href={`tel:${r.phone}`}>
                          <Phone className="mr-1 inline h-3 w-3" />
                          {r.phone}
                        </a>
                      </p>
                      {r.email && (
                        <p className="text-xs text-muted-foreground">
                          <a className="hover:underline" href={`mailto:${r.email}`}>
                            <Mail className="mr-1 inline h-3 w-3" />
                            {r.email}
                          </a>
                        </p>
                      )}
                      {r.healthInsurance && (
                        <p className="text-xs text-muted-foreground">OS: {r.healthInsurance}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.specialization?.name ?? <span className="text-muted-foreground">—</span>}
                      {r.preferredDay && (
                        <p className="text-xs text-muted-foreground">{r.preferredDay}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-sm">
                      {r.message ? <p className="line-clamp-3">{r.message}</p> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => openWhatsapp(r)} className="gap-1.5">
                          <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                          WhatsApp
                        </Button>
                        {r.status !== "read" && (
                          <Button size="sm" variant="ghost" onClick={() => patch(r.id, { status: "read" })} className="gap-1.5">
                            <Check className="h-3.5 w-3.5" /> Marcar leída
                          </Button>
                        )}
                        {r.status !== "archived" && (
                          <Button size="sm" variant="ghost" onClick={() => patch(r.id, { status: "archived" })} className="gap-1.5">
                            <Archive className="h-3.5 w-3.5" /> Archivar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab root
// ────────────────────────────────────────────────────────────────────────────

export function ConsultorioTab() {
  return (
    <div className="space-y-6">
      <SettingsCard />
      <HoursCard />
      <InboxCard />
    </div>
  );
}
