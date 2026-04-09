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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { Loader2, Plus, X, Calendar } from "lucide-react";
import type { UserPreference, BlockDay } from "@/types";
import { DAY_NAMES } from "@/types";

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
        <CardDescription>
          Actualiza tu información personal.
        </CardDescription>
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
              <p className="text-sm text-destructive">{errors.name.message}</p>
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
              El email no se puede cambiar desde aquí.
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

// ─── Work Hours Section ──────────────────────────────────────────────────────

interface DayPreference {
  day: number;
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
          const data: UserPreference[] = json.data?.preferences ?? json.data ?? [];
          // Map existing preferences, fill missing days
          const mapped: DayPreference[] = [];
          for (let d = 0; d < 7; d++) {
            const existing = data.find((p) => p.day === d);
            mapped.push({
              day: d,
              fromHourAM: existing?.fromHourAM ?? "",
              toHourAM: existing?.toHourAM ?? "",
              fromHourPM: existing?.fromHourPM ?? "",
              toHourPM: existing?.toHourPM ?? "",
            });
          }
          setPreferences(mapped);
        } else {
          // Default empty
          setPreferences(
            Array.from({ length: 7 }, (_, d) => ({
              day: d,
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

    // Validate time format before sending
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    for (const pref of preferences) {
      const fields = [
        { val: pref.fromHourAM, label: "Desde AM" },
        { val: pref.toHourAM, label: "Hasta AM" },
        { val: pref.fromHourPM, label: "Desde PM" },
        { val: pref.toHourPM, label: "Hasta PM" },
      ];
      for (const f of fields) {
        if (f.val && !timeRegex.test(f.val)) {
          toast.error(`Formato de hora inválido en ${DAY_NAMES[pref.day]} - ${f.label}`);
          return;
        }
      }
      // Validate from < to for AM and PM
      if (pref.fromHourAM && pref.toHourAM && pref.fromHourAM >= pref.toHourAM) {
        toast.error(`${DAY_NAMES[pref.day]}: hora inicio AM debe ser menor que fin AM`);
        return;
      }
      if (pref.fromHourPM && pref.toHourPM && pref.fromHourPM >= pref.toHourPM) {
        toast.error(`${DAY_NAMES[pref.day]}: hora inicio PM debe ser menor que fin PM`);
        return;
      }
    }

    // Convert empty strings to null for API
    const cleanPrefs = preferences.map((p) => ({
      day: p.day,
      fromHourAM: p.fromHourAM || null,
      toHourAM: p.toHourAM || null,
      fromHourPM: p.fromHourPM || null,
      toHourPM: p.toHourPM || null,
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
        error instanceof Error ? error.message : "Error al guardar los horarios"
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
        <CardTitle>Horarios de Atención</CardTitle>
        <CardDescription>
          Configura tus horarios de trabajo por día de la semana.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium">Día</th>
                <th className="px-2 py-2 text-center font-medium" colSpan={2}>
                  Mañana
                </th>
                <th className="px-2 py-2 text-center font-medium" colSpan={2}>
                  Tarde
                </th>
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                <th />
                <th className="px-2 py-1">Desde</th>
                <th className="px-2 py-1">Hasta</th>
                <th className="px-2 py-1">Desde</th>
                <th className="px-2 py-1">Hasta</th>
              </tr>
            </thead>
            <tbody>
              {preferences.map((pref) => (
                <tr key={pref.day} className="border-b">
                  <td className="py-2 pr-4 font-medium">
                    {DAY_NAMES[pref.day]}
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="time"
                      className="h-8 text-xs"
                      value={pref.fromHourAM}
                      onChange={(e) =>
                        updatePref(pref.day, "fromHourAM", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="time"
                      className="h-8 text-xs"
                      value={pref.toHourAM}
                      onChange={(e) =>
                        updatePref(pref.day, "toHourAM", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="time"
                      className="h-8 text-xs"
                      value={pref.fromHourPM}
                      onChange={(e) =>
                        updatePref(pref.day, "fromHourPM", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="time"
                      className="h-8 text-xs"
                      value={pref.toHourPM}
                      onChange={(e) =>
                        updatePref(pref.day, "toHourPM", e.target.value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function BlockDaysSection() {
  const { data: session } = useSession();
  const [blockDays, setBlockDays] = useState<BlockDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [adding, setAdding] = useState(false);

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
      toast.error("Error al cargar días bloqueados");
    } finally {
      setLoading(false);
    }
  }

  async function addBlockDay() {
    if (!newDate) {
      toast.error("Selecciona una fecha");
      return;
    }
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDate)) {
      toast.error("Formato de fecha inválido");
      return;
    }
    const parsed = new Date(newDate);
    if (isNaN(parsed.getTime())) {
      toast.error("Fecha inválida");
      return;
    }
    try {
      setAdding(true);
      const userId = (session?.user as { id?: string } | undefined)?.id;
      if (!userId) {
        toast.error("No se pudo obtener el usuario");
        return;
      }
      const res = await fetch("/api/preferences/block-days", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, dates: [newDate] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al agregar día bloqueado");
      }
      toast.success("Día bloqueado agregado");
      setNewDate("");
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
      toast.success("Día bloqueado eliminado");
      setBlockDays((prev) => prev.filter((b) => b.id !== id));
    } catch {
      toast.error("Error al eliminar el día bloqueado");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Días Bloqueados</CardTitle>
        <CardDescription>
          Agrega fechas en las que no atenderás pacientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new block day */}
        <div className="flex max-w-md gap-2">
          <div className="relative flex-1">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              className="pl-10"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <Button onClick={addBlockDay} disabled={adding} size="sm">
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : blockDays.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay días bloqueados.
          </p>
        ) : (
          <div className="max-w-lg space-y-2">
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
                  <span className="text-sm">
                    {new Date(bd.date).toLocaleDateString("es-AR", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
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
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Gestiona tu perfil y preferencias de atención
        </p>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="horarios">Horarios</TabsTrigger>
          <TabsTrigger value="bloqueos">Días Bloqueados</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="horarios" className="mt-6">
          <WorkHoursSection />
        </TabsContent>

        <TabsContent value="bloqueos" className="mt-6">
          <BlockDaysSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
