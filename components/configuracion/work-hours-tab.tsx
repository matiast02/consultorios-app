"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Clock,
  Calendar as CalendarIcon,
  Copy,
  Loader2,
  Tag,
  Sunrise,
  Sunset,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { DAY_NAMES } from "@/types";
import type { UserPreference } from "@/types";
import { cn } from "@/lib/utils";

// Day order shown in UI: Mon..Sun
const UI_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"] as const;

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06..22
const MINUTES = ["00", "15", "30", "45"];
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (const h of HOURS) for (const m of MINUTES) out.push(`${String(h).padStart(2, "0")}:${m}`);
  return out;
})();

const SLOT_DURATION_OPTIONS = [10, 15, 20, 25, 30, 40, 45, 60, 90];
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30];
const ADVANCE_OPTIONS = [
  { value: 0, label: "Sin restricción" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 360, label: "6 horas antes" },
  { value: 720, label: "12 horas antes" },
  { value: 1440, label: "1 día antes" },
  { value: 2880, label: "2 días antes" },
];

interface DayPref {
  day: number;
  enabled: boolean;
  fromHourAM: string;
  toHourAM: string;
  fromHourPM: string;
  toHourPM: string;
}

interface ConfigState {
  slotDurationMinutes: number;
  bufferMinutes: number;
  minAdvanceMinutes: number;
}

function diffMinutes(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  return Math.max(0, (th * 60 + tm) - (fh * 60 + fm));
}

function formatHours(mins: number): string {
  const h = Math.round((mins / 60) * 10) / 10;
  return h === Math.floor(h) ? `${h} hs` : `${h.toFixed(1).replace(".", ",")} hs`;
}

// ─── Native-style select (matches design's clean look) ─────────────────────
function NativeSelect({
  value,
  onChange,
  options,
  className,
  disabled,
  placeholder,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm",
          "shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {placeholder && !value && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

const TIME_SELECT_OPTIONS = TIME_OPTIONS.map((t) => ({ value: t, label: t }));

function TimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <NativeSelect
      value={value}
      onChange={onChange}
      options={TIME_SELECT_OPTIONS}
      disabled={disabled}
      placeholder="—"
    />
  );
}

export function WorkHoursTab() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const [loading, setLoading] = useState(true);
  const [savingHours, setSavingHours] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [prefs, setPrefs] = useState<DayPref[]>([]);
  const [hoursDirty, setHoursDirty] = useState(false);

  const [config, setConfig] = useState<ConfigState>({
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    minAdvanceMinutes: 60,
  });
  const [configDirty, setConfigDirty] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/preferences"), fetch("/api/user/preferences-config")])
      .then(async ([prefRes, configRes]) => {
        if (prefRes.ok) {
          const json = await prefRes.json();
          const data: UserPreference[] = json.data?.preferences ?? [];
          const mapped: DayPref[] = [];
          for (let d = 0; d < 7; d++) {
            const existing = data.find((p) => p.day === d);
            const hasHours =
              !!existing?.fromHourAM ||
              !!existing?.toHourAM ||
              !!existing?.fromHourPM ||
              !!existing?.toHourPM;
            mapped.push({
              day: d,
              enabled: hasHours,
              fromHourAM: existing?.fromHourAM ?? "",
              toHourAM: existing?.toHourAM ?? "",
              fromHourPM: existing?.fromHourPM ?? "",
              toHourPM: existing?.toHourPM ?? "",
            });
          }
          setPrefs(mapped);
        }
        if (configRes.ok) {
          const { data } = await configRes.json();
          setConfig({
            slotDurationMinutes: data.slotDurationMinutes ?? 30,
            bufferMinutes: data.bufferMinutes ?? 0,
            minAdvanceMinutes: data.minAdvanceMinutes ?? 60,
          });
        }
      })
      .catch(() => toast.error("Error al cargar horarios"))
      .finally(() => setLoading(false));
  }, []);

  const dayMinutes = useMemo(
    () =>
      prefs.map((p) => {
        if (!p.enabled) return 0;
        return diffMinutes(p.fromHourAM, p.toHourAM) + diffMinutes(p.fromHourPM, p.toHourPM);
      }),
    [prefs]
  );
  const totalMinutes = useMemo(() => dayMinutes.reduce((a, b) => a + b, 0), [dayMinutes]);
  const activeDays = useMemo(
    () => prefs.filter((p) => p.enabled && dayMinutes[p.day] > 0).length,
    [prefs, dayMinutes]
  );
  const slotsPerWeek = useMemo(() => {
    const slotTotal = config.slotDurationMinutes + config.bufferMinutes;
    return slotTotal > 0 ? Math.floor(totalMinutes / slotTotal) : 0;
  }, [totalMinutes, config]);

  function updatePref(day: number, patch: Partial<DayPref>) {
    setPrefs((prev) => prev.map((p) => (p.day === day ? { ...p, ...patch } : p)));
    setHoursDirty(true);
  }

  function clearShift(day: number, shift: "AM" | "PM") {
    if (shift === "AM") updatePref(day, { fromHourAM: "", toHourAM: "" });
    else updatePref(day, { fromHourPM: "", toHourPM: "" });
  }

  function copyDayTo(from: number, targets: number[]) {
    setPrefs((prev) =>
      prev.map((p) => {
        if (!targets.includes(p.day)) return p;
        const src = prev.find((x) => x.day === from)!;
        return {
          day: p.day,
          enabled: true,
          fromHourAM: src.fromHourAM,
          toHourAM: src.toHourAM,
          fromHourPM: src.fromHourPM,
          toHourPM: src.toHourPM,
        };
      })
    );
    setHoursDirty(true);
    toast.success(`Copiado a ${targets.length} día(s)`);
  }

  function applyLunesToMarVie() {
    const lun = prefs.find((p) => p.day === 1);
    if (!lun || !lun.enabled) {
      toast.error("Configurá los horarios del lunes primero");
      return;
    }
    copyDayTo(1, [2, 3, 4, 5]);
  }

  async function saveHours() {
    if (!userId) {
      toast.error("Usuario no encontrado");
      return;
    }
    for (const p of prefs) {
      if (!p.enabled) continue;
      if (p.fromHourAM && p.toHourAM && p.fromHourAM >= p.toHourAM) {
        toast.error(`${DAY_NAMES[p.day]}: la hora de inicio (mañana) debe ser menor que la de fin`);
        return;
      }
      if (p.fromHourPM && p.toHourPM && p.fromHourPM >= p.toHourPM) {
        toast.error(`${DAY_NAMES[p.day]}: la hora de inicio (tarde) debe ser menor que la de fin`);
        return;
      }
    }
    setSavingHours(true);
    try {
      const payload = {
        userId,
        preferences: prefs.map((p) => ({
          day: p.day,
          fromHourAM: p.enabled && p.fromHourAM ? p.fromHourAM : null,
          toHourAM: p.enabled && p.toHourAM ? p.toHourAM : null,
          fromHourPM: p.enabled && p.fromHourPM ? p.fromHourPM : null,
          toHourPM: p.enabled && p.toHourPM ? p.toHourPM : null,
        })),
      };
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Horarios guardados");
      setHoursDirty(false);
    } catch {
      toast.error("Error al guardar horarios");
    } finally {
      setSavingHours(false);
    }
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/user/preferences-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      toast.success("Configuración guardada");
      setConfigDirty(false);
    } catch {
      toast.error("Error al guardar configuración");
    } finally {
      setSavingConfig(false);
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

  const hours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;
  const totalLabel = remainingMins > 0 ? `${hours} hs ${remainingMins}m` : `${hours} hs`;

  return (
    <div className="space-y-4">
      {/* ─── Resumen semanal ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-5 w-5 text-primary" />
                Resumen semanal
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {totalLabel} disponibles · {activeDays} {activeDays === 1 ? "día activo" : "días activos"} · ≈ {slotsPerWeek} turnos por semana
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyLunesToMarVie}
              className="self-start sm:self-auto"
            >
              <Copy className="mr-2 h-3.5 w-3.5" />
              Aplicar lunes a Mar–Vie
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {UI_DAY_ORDER.map((d) => {
              const pref = prefs.find((p) => p.day === d)!;
              const dayMin = dayMinutes[d];
              const active = pref.enabled && dayMin > 0;
              const amText = pref.fromHourAM && pref.toHourAM ? `${pref.fromHourAM}–${pref.toHourAM}` : null;
              const pmText = pref.fromHourPM && pref.toHourPM ? `${pref.fromHourPM}–${pref.toHourPM}` : null;
              return (
                <div
                  key={d}
                  className={cn(
                    "relative flex min-h-[112px] flex-col overflow-hidden rounded-xl border p-3 text-xs transition-colors",
                    active
                      ? "border-primary/30 bg-gradient-to-b from-primary/15 via-card via-60% to-card"
                      : "border-dashed bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "mb-1.5 text-[11px] font-semibold tracking-wider",
                      active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {DAY_SHORT[d]}
                  </span>
                  {active ? (
                    <>
                      <span className="text-foreground">{amText ?? "—"}</span>
                      <span className="text-foreground">{pmText ?? "—"}</span>
                      <span className="mt-auto pt-2 text-[11px] text-muted-foreground">{formatHours(dayMin)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">Cerrado</span>
                      <span className="mt-auto pt-2 text-[11px] text-muted-foreground/70">No atiende</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Duración del turno ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-5 w-5 text-primary" />
            Duración del turno
          </CardTitle>
          <CardDescription>Acá definís la grilla con la que se ofrecen turnos a tus pacientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Duración del turno</Label>
              <NativeSelect
                value={config.slotDurationMinutes}
                onChange={(v) => {
                  setConfig({ ...config, slotDurationMinutes: Number(v) });
                  setConfigDirty(true);
                }}
                options={SLOT_DURATION_OPTIONS.map((m) => ({ value: m, label: `${m} minutos` }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Tiempo entre turnos <span className="text-muted-foreground">(buffer)</span>
              </Label>
              <NativeSelect
                value={config.bufferMinutes}
                onChange={(v) => {
                  setConfig({ ...config, bufferMinutes: Number(v) });
                  setConfigDirty(true);
                }}
                options={BUFFER_OPTIONS.map((m) => ({
                  value: m,
                  label: m === 0 ? "Sin buffer" : `${m} minutos`,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Anticipación mínima</Label>
              <NativeSelect
                value={config.minAdvanceMinutes}
                onChange={(v) => {
                  setConfig({ ...config, minAdvanceMinutes: Number(v) });
                  setConfigDirty(true);
                }}
                options={ADVANCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>
          </div>
          {configDirty && (
            <div className="mt-4 flex justify-end">
              <Button type="button" size="sm" onClick={saveConfig} disabled={savingConfig}>
                {savingConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Horarios de atención ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Horarios de atención
          </CardTitle>
          <CardDescription>Activá los días que trabajás y configurá los turnos de mañana y tarde.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {UI_DAY_ORDER.map((d) => {
            const pref = prefs.find((p) => p.day === d)!;
            const dayMin = dayMinutes[d];
            return (
              <div
                key={d}
                className={cn(
                  "rounded-lg border bg-card p-4 transition-colors",
                  !pref.enabled && "opacity-70"
                )}
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={pref.enabled}
                      onCheckedChange={(checked) =>
                        updatePref(d, {
                          enabled: checked,
                          ...(!checked
                            ? { fromHourAM: "", toHourAM: "", fromHourPM: "", toHourPM: "" }
                            : {}),
                        })
                      }
                    />
                    <span className="font-medium">{DAY_NAMES[d]}</span>
                  </div>

                  {pref.enabled ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{formatHours(dayMin)}</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <Copy className="mr-1.5 h-3 w-3" />
                            Copiar a…
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="end">
                          <button
                            type="button"
                            onClick={() => copyDayTo(d, UI_DAY_ORDER.filter((x) => x !== d))}
                            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            Todos los días
                          </button>
                          <button
                            type="button"
                            onClick={() => copyDayTo(d, [1, 2, 3, 4, 5].filter((x) => x !== d))}
                            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            Lun a Vie
                          </button>
                          <button
                            type="button"
                            onClick={() => copyDayTo(d, [6, 0].filter((x) => x !== d))}
                            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            Sáb y Dom
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No atiende</span>
                  )}
                </div>

                {/* Shift cards */}
                {pref.enabled && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* MAÑANA */}
                    <div className="rounded-md border bg-muted/40 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <Sunrise className="h-3 w-3" />
                          Mañana
                        </div>
                        {(pref.fromHourAM || pref.toHourAM) && (
                          <button
                            type="button"
                            onClick={() => clearShift(d, "AM")}
                            className="text-xs text-primary hover:underline"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <TimeSelect
                          value={pref.fromHourAM}
                          onChange={(v) => updatePref(d, { fromHourAM: v })}
                        />
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <TimeSelect
                          value={pref.toHourAM}
                          onChange={(v) => updatePref(d, { toHourAM: v })}
                        />
                      </div>
                    </div>

                    {/* TARDE */}
                    <div className="rounded-md border bg-muted/40 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <Sunset className="h-3 w-3" />
                          Tarde
                        </div>
                        {(pref.fromHourPM || pref.toHourPM) && (
                          <button
                            type="button"
                            onClick={() => clearShift(d, "PM")}
                            className="text-xs text-primary hover:underline"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <TimeSelect
                          value={pref.fromHourPM}
                          onChange={(v) => updatePref(d, { fromHourPM: v })}
                        />
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <TimeSelect
                          value={pref.toHourPM}
                          onChange={(v) => updatePref(d, { toHourPM: v })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {hoursDirty && (
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={saveHours} disabled={savingHours}>
                {savingHours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar horarios
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
