"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity,
  AlertTriangle,
  Briefcase,
  Clock,
  Cigarette,
  Droplet,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
  User as UserIcon,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import type {
  ClinicalRecord,
  AllergySeverity,
  StructuredAllergy,
} from "@/types";
import { ALLERGY_SEVERITY_LABELS, BLOOD_TYPES } from "@/types";
import { SectionHead, fmtDateAR, fmtTime, safeParseJSON } from "./shared";
import { cn } from "@/lib/utils";

interface HistoriaTabProps {
  patientId: string;
  record: ClinicalRecord | null;
  onSaved: (next: ClinicalRecord) => void;
}

interface FormState {
  bloodType: string;
  heightCm: string;
  weightKg: string;
  personalHistory: string;
  familyHistory: string;
  habitsTobacco: string;
  habitsAlcohol: string;
  habitsActivity: string;
  habitsDiet: string;
  notes: string;
  structuredAllergies: StructuredAllergy[];
}

function recordToForm(r: ClinicalRecord | null): FormState {
  return {
    bloodType: r?.bloodType ?? "",
    heightCm: r?.heightCm != null ? String(r.heightCm) : "",
    weightKg: r?.weightKg != null ? String(r.weightKg) : "",
    personalHistory: r?.personalHistory ?? "",
    familyHistory: r?.familyHistory ?? "",
    habitsTobacco: r?.habitsTobacco ?? "",
    habitsAlcohol: r?.habitsAlcohol ?? "",
    habitsActivity: r?.habitsActivity ?? "",
    habitsDiet: r?.habitsDiet ?? "",
    notes: r?.notes ?? "",
    structuredAllergies: safeParseJSON<StructuredAllergy[]>(
      r?.structuredAllergies ?? null,
      [],
    ),
  };
}

function calcIMC(heightCm: string, weightKg: string): number | null {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w || h < 30) return null;
  return w / Math.pow(h / 100, 2);
}

function imcLabel(imc: number): { label: string; tone: string } {
  if (imc < 18.5)
    return {
      label: "Bajo peso",
      tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
    };
  if (imc < 25)
    return {
      label: "Normal",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300",
    };
  if (imc < 30)
    return {
      label: "Sobrepeso",
      tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
    };
  return {
    label: "Obesidad",
    tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300",
  };
}

export function HistoriaTab({ patientId, record, onSaved }: HistoriaTabProps) {
  const [form, setForm] = useState<FormState>(() => recordToForm(record));
  const [savedAt, setSavedAt] = useState<Date | null>(
    record?.updatedAt ? new Date(record.updatedAt) : null,
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset when record changes from outside
  useEffect(() => {
    setForm(recordToForm(record));
    setSavedAt(record?.updatedAt ? new Date(record.updatedAt) : null);
    setDirty(false);
  }, [record]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function patchAllergy(index: number, next: Partial<StructuredAllergy>) {
    setForm((f) => ({
      ...f,
      structuredAllergies: f.structuredAllergies.map((a, i) =>
        i === index ? { ...a, ...next } : a,
      ),
    }));
    setDirty(true);
  }
  function addAllergy() {
    setForm((f) => ({
      ...f,
      structuredAllergies: [
        ...f.structuredAllergies,
        { nombre: "", severidad: "media", nota: "" },
      ],
    }));
    setDirty(true);
  }
  function removeAllergy(index: number) {
    setForm((f) => ({
      ...f,
      structuredAllergies: f.structuredAllergies.filter((_, i) => i !== index),
    }));
    setDirty(true);
  }

  const imc = useMemo(
    () => calcIMC(form.heightCm, form.weightKg),
    [form.heightCm, form.weightKg],
  );

  function discard() {
    setForm(recordToForm(record));
    setDirty(false);
  }

  async function save() {
    try {
      setSaving(true);
      const body: Record<string, unknown> = {
        bloodType: form.bloodType || null,
        heightCm: form.heightCm ? Number(form.heightCm) : null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        personalHistory: form.personalHistory || null,
        familyHistory: form.familyHistory || null,
        habitsTobacco: form.habitsTobacco || null,
        habitsAlcohol: form.habitsAlcohol || null,
        habitsActivity: form.habitsActivity || null,
        habitsDiet: form.habitsDiet || null,
        notes: form.notes || null,
        structuredAllergies: form.structuredAllergies.filter(
          (a) => a.nombre.trim().length > 0,
        ),
      };
      const res = await fetch(`/api/patients/${patientId}/clinical-record`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar");
      }
      const json = await res.json();
      toast.success("Historia clínica guardada");
      onSaved(json.data);
      setSavedAt(new Date());
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-[18px]">
        {/* Card 1: Datos clínicos + IMC */}
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead
            icon={Droplet}
            title="Datos clínicos"
            description="Grupo sanguíneo, antropometría y signos vitales basales."
            actions={
              savedAt && (
                <Badge
                  variant="secondary"
                  className="bg-muted/70 font-medium text-muted-foreground"
                >
                  <Clock className="mr-1 h-3 w-3" />
                  Guardado {fmtTime(savedAt)} · {fmtDateAR(savedAt)}
                </Badge>
              )
            }
          />
          <div className="px-6 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Grupo sanguíneo">
                <select
                  value={form.bloodType}
                  onChange={(e) => patch("bloodType", e.target.value)}
                  className={cn(
                    "h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm shadow-sm",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                  )}
                >
                  <option value="">Sin definir</option>
                  {BLOOD_TYPES.map((bt) => (
                    <option key={bt} value={bt}>
                      {bt}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  <>
                    Altura{" "}
                    <span className="font-normal text-muted-foreground">cm</span>
                  </>
                }
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.heightCm}
                  onChange={(e) => patch("heightCm", e.target.value)}
                  placeholder="170"
                />
              </Field>
              <Field
                label={
                  <>
                    Peso{" "}
                    <span className="font-normal text-muted-foreground">kg</span>
                  </>
                }
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.weightKg}
                  onChange={(e) => patch("weightKg", e.target.value)}
                  placeholder="70.5"
                />
              </Field>
            </div>

            {imc !== null && (
              <div className="mt-3 flex items-center gap-4 rounded-[10px] bg-muted/50 px-3 py-2.5">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                    IMC
                  </div>
                  <div className="text-[20px] font-bold tabular-nums tracking-tight">
                    {imc.toFixed(1)}
                  </div>
                </div>
                <Badge variant="outline" className={cn(imcLabel(imc).tone)}>
                  {imcLabel(imc).label}
                </Badge>
              </div>
            )}
          </div>
        </Card>

        {/* Card 2: Antecedentes */}
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead
            icon={Briefcase}
            title="Antecedentes"
            description="Historia clínica del paciente y antecedentes familiares relevantes."
          />
          <div className="space-y-3.5 px-6 pt-4">
            <Field label="Antecedentes personales">
              <Textarea
                rows={4}
                value={form.personalHistory}
                onChange={(e) => patch("personalHistory", e.target.value)}
                placeholder="Enfermedades previas, cirugías, internaciones..."
              />
            </Field>
            <Field label="Antecedentes familiares">
              <Textarea
                rows={4}
                value={form.familyHistory}
                onChange={(e) => patch("familyHistory", e.target.value)}
                placeholder="Padres, hermanos, hijos con condiciones relevantes..."
              />
            </Field>
          </div>
        </Card>

        {/* Card 3: Hábitos */}
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead
            icon={UserIcon}
            title="Hábitos"
            description="Tabaco, alcohol, actividad física y alimentación."
          />
          <div className="grid grid-cols-1 gap-3 px-6 pt-4 sm:grid-cols-2">
            <HabitField
              icon={Cigarette}
              label="Tabaco"
              value={form.habitsTobacco}
              onChange={(v) => patch("habitsTobacco", v)}
              placeholder="Ex-fumador (dejó en 2010)"
            />
            <HabitField
              icon={Wine}
              label="Alcohol"
              value={form.habitsAlcohol}
              onChange={(v) => patch("habitsAlcohol", v)}
              placeholder="Ocasional (1–2 copas/sem)"
            />
            <HabitField
              icon={Activity}
              label="Actividad física"
              value={form.habitsActivity}
              onChange={(v) => patch("habitsActivity", v)}
              placeholder="Caminata 30 min, 3 veces por semana"
            />
            <HabitField
              icon={UtensilsCrossed}
              label="Dieta"
              value={form.habitsDiet}
              onChange={(v) => patch("habitsDiet", v)}
              placeholder="Hiposódica"
            />
          </div>
        </Card>

        {/* Card 4: Alergias */}
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead
            icon={AlertTriangle}
            title="Alergias"
            description="Lista de alergias conocidas con severidad."
            actions={
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={addAllergy}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Agregar
              </Button>
            }
          />
          <div className="space-y-2 px-6 pt-4">
            {form.structuredAllergies.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                Sin alergias registradas.
              </p>
            ) : (
              form.structuredAllergies.map((a, i) => (
                <AllergyRow
                  key={i}
                  allergy={a}
                  onChange={(next) => patchAllergy(i, next)}
                  onRemove={() => removeAllergy(i)}
                />
              ))
            )}
          </div>
        </Card>

        {/* Card 5: Notas */}
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead icon={StickyNote} title="Notas generales" />
          <div className="px-6 pt-4">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => patch("notes", e.target.value)}
              placeholder="Observaciones generales del paciente..."
            />
          </div>
        </Card>
      </div>

      {/* Floating save bar */}
      {dirty && (
        <div className="sticky bottom-4 z-30 mt-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-[10px] border bg-card px-4 py-3 shadow-lg">
            <span className="text-sm text-muted-foreground">
              Hay <strong className="font-semibold text-foreground">cambios sin guardar</strong> en la historia clínica
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
                Descartar
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Guardar cambios
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Subcomponents ───────────────────────────────────────────────────── */

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium">{label}</Label>
      {children}
    </div>
  );
}

function HabitField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: typeof Cigarette;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-[12px] font-medium">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

const SEVERITY_TONE: Record<AllergySeverity, string> = {
  alta: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200",
  media:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
  baja:
    "border-border bg-muted text-foreground/80",
};

function AllergyRow({
  allergy,
  onChange,
  onRemove,
}: {
  allergy: StructuredAllergy;
  onChange: (next: Partial<StructuredAllergy>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-[9px] border px-3 py-2.5 text-[12.5px]",
        SEVERITY_TONE[allergy.severidad],
      )}
    >
      <Input
        value={allergy.nombre}
        onChange={(e) => onChange({ nombre: e.target.value })}
        placeholder="Nombre de la alergia"
        className="h-8 max-w-[200px] flex-1 bg-background/70 text-[13px]"
      />
      <Input
        value={allergy.nota ?? ""}
        onChange={(e) => onChange({ nota: e.target.value })}
        placeholder="Nota (opcional)"
        className="h-8 min-w-[180px] flex-[2] bg-background/70 text-[12.5px]"
      />
      <select
        value={allergy.severidad}
        onChange={(e) =>
          onChange({ severidad: e.target.value as AllergySeverity })
        }
        className="h-8 appearance-none rounded-md border border-input bg-background/70 px-2 pr-7 text-[12px] font-semibold uppercase tracking-wide shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {(Object.keys(ALLERGY_SEVERITY_LABELS) as AllergySeverity[]).map((k) => (
          <option key={k} value={k}>
            {ALLERGY_SEVERITY_LABELS[k]}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-rose-600"
        onClick={onRemove}
        aria-label="Eliminar alergia"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
