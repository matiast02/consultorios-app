"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Loader2,
  Save,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  Stethoscope,
  Calendar,
  Pill,
  Eye,
  Pencil,
  Trash2,
  UtensilsCrossed,
  Copy,
} from "lucide-react";
import { EvolutionFormDialog } from "@/components/clinical/evolution-form-dialog";
import { CreatePrescriptionDialog } from "@/components/prescriptions/create-prescription-dialog";
import { PrescriptionView } from "@/components/prescriptions/prescription-view";
import { CreateMealPlanDialog } from "@/components/nutrition/create-meal-plan-dialog";
import { MealPlanView } from "@/components/nutrition/meal-plan-view";
import type { Patient, ClinicalRecord, Evolution, Prescription, PrescriptionItem, MealPlan, MealSection, ModuleConfig } from "@/types";
import { BLOOD_TYPES } from "@/types";
import { useProfessionLabels } from "@/hooks/use-profession-labels";
import { OdontogramEditor } from "@/components/dental/odontogram-editor";
import type { OdontogramData } from "@/components/dental/odontogram-types";
import { createEmptyOdontogram } from "@/components/dental/odontogram-types";
import { AnthropometricTracker } from "@/components/nutrition/anthropometric-tracker";
import type { AnthropometricData } from "@/components/nutrition/anthropometric-types";
import { createEmptyAnthropometricData } from "@/components/nutrition/anthropometric-types";
import { GenogramEditor } from "@/components/psychology/genogram-editor";
import type { GenogramData } from "@/components/psychology/genogram-types";
import { createEmptyGenogramData } from "@/components/psychology/genogram-types";

export default function HistoriaClinicaPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const patientId = params.id as string;
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const labels = useProfessionLabels(sessionUserId);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evolutionDialogOpen, setEvolutionDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEvolutions, setExpandedEvolutions] = useState<Set<string>>(
    new Set()
  );

  // Prescriptions state
  const [prescriptionsEnabled, setPrescriptionsEnabled] = useState(false);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [prescriptionDialogOpen, setPrescriptionDialogOpen] = useState(false);
  const [viewingPrescription, setViewingPrescription] = useState<Prescription | null>(null);

  // Meal plans state
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [mealPlanDialogOpen, setMealPlanDialogOpen] = useState(false);
  const [editingMealPlan, setEditingMealPlan] = useState<MealPlan | null>(null);
  const [viewingMealPlan, setViewingMealPlan] = useState<MealPlan | null>(null);

  // Form state for clinical record
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [personalHistory, setPersonalHistory] = useState("");
  const [familyHistory, setFamilyHistory] = useState("");
  const [currentMedication, setCurrentMedication] = useState("");
  const [notes, setNotes] = useState("");
  const [odontogramData, setOdontogramData] = useState<OdontogramData>(createEmptyOdontogram());
  const [anthropometricData, setAnthropometricData] = useState<AnthropometricData>(createEmptyAnthropometricData());
  const [genogramData, setGenogramData] = useState<GenogramData>(createEmptyGenogramData());
  const [hasDentalConfig, setHasDentalConfig] = useState(false);
  const [hasAnthropometricConfig, setHasAnthropometricConfig] = useState(false);
  const [hasGenogramConfig, setHasGenogramConfig] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [patientRes, recordRes, evolutionsRes, modulesRes] = await Promise.all([
        fetch(`/api/patients/${patientId}`),
        fetch(`/api/patients/${patientId}/clinical-record`),
        fetch(`/api/patients/${patientId}/evolutions`),
        fetch("/api/modules"),
      ]);

      if (!patientRes.ok) throw new Error("Paciente no encontrado");
      const patientJson = await patientRes.json();
      setPatient(patientJson.data ?? patientJson);

      if (recordRes.ok) {
        const recordJson = await recordRes.json();
        const data = recordJson.data;
        if (data) {
          setRecord(data);
          setBloodType(data.bloodType ?? "");
          setAllergies(data.allergies ?? "");
          setPersonalHistory(data.personalHistory ?? "");
          setFamilyHistory(data.familyHistory ?? "");
          setCurrentMedication(data.currentMedication ?? "");
          setNotes(data.notes ?? "");
          // Load custom fields (odontogram, anthropometric data, genogram)
          if (data.customFields) {
            try {
              const custom = JSON.parse(data.customFields);
              if (custom.odontogram) setOdontogramData(custom.odontogram);
              if (custom.anthropometric) setAnthropometricData(custom.anthropometric);
              if (custom.genogram) setGenogramData(custom.genogram);
            } catch { /* invalid JSON, ignore */ }
          }
        }
      }

      // Odontogram data loaded above from customFields

      if (evolutionsRes.ok) {
        const evolutionsJson = await evolutionsRes.json();
        const list = evolutionsJson.data ?? [];
        setEvolutions(Array.isArray(list) ? list : []);
      }

      // Check if prescriptions module is enabled
      if (modulesRes.ok) {
        const modulesJson = await modulesRes.json();
        const modules: ModuleConfig[] = modulesJson.data ?? [];
        const prescMod = modules.find((m) => m.module === "prescriptions");
        if (prescMod?.enabled) {
          setPrescriptionsEnabled(true);
          // Fetch prescriptions
          const prescRes = await fetch(`/api/prescriptions?patientId=${patientId}`);
          if (prescRes.ok) {
            const prescJson = await prescRes.json();
            setPrescriptions(prescJson.data ?? []);
          }
          // Also fetch meal plans (for nutritionists the tab shows meal plans instead)
          const mealRes = await fetch(`/api/meal-plans?patientId=${patientId}`);
          if (mealRes.ok) {
            const mealJson = await mealRes.json();
            setMealPlans(mealJson.data ?? []);
          }
        } else {
          setPrescriptionsEnabled(false);
        }
      }
    } catch {
      toast.error("Error al cargar la historia clinica");
      router.push(`/dashboard/pacientes/${patientId}`);
    } finally {
      setLoading(false);
    }
  }, [patientId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check dental config (separate effect, depends on session)
  useEffect(() => {
    if (!sessionUserId) return;
    async function checkDentalConfig() {
      try {
        const res = await fetch(`/api/users/${sessionUserId}/profession-config`);
        if (res.ok) {
          const json = await res.json();
          const config = json.data;
          if (config?.clinicalFields) {
            const fields = JSON.parse(config.clinicalFields);
            setHasDentalConfig(Array.isArray(fields) && fields.includes("odontogram"));
            setHasAnthropometricConfig(Array.isArray(fields) && fields.includes("anthropometricTracker"));
            setHasGenogramConfig(Array.isArray(fields) && fields.includes("genogram"));
          }
        }
      } catch { /* non-critical */ }
    }
    checkDentalConfig();
  }, [sessionUserId]);

  async function handleSaveRecord() {
    try {
      setSaving(true);
      const body: Record<string, string> = {};
      if (bloodType) body.bloodType = bloodType;
      if (allergies) body.allergies = allergies;
      if (personalHistory) body.personalHistory = personalHistory;
      if (familyHistory) body.familyHistory = familyHistory;
      if (currentMedication) body.currentMedication = currentMedication;
      if (notes) body.notes = notes;
      // Save profession-specific data in customFields
      if (hasDentalConfig || hasAnthropometricConfig || hasGenogramConfig) {
        const existing = record?.customFields ? JSON.parse(record.customFields) : {};
        const custom = { ...existing };
        if (hasDentalConfig) {
          custom.odontogram = { ...odontogramData, lastUpdated: new Date().toISOString() };
        }
        if (hasAnthropometricConfig) {
          custom.anthropometric = { ...anthropometricData, lastUpdated: new Date().toISOString() };
        }
        if (hasGenogramConfig) {
          custom.genogram = { ...genogramData, lastUpdated: new Date().toISOString() };
        }
        body.customFields = JSON.stringify(custom);
      }

      const res = await fetch(`/api/patients/${patientId}/clinical-record`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al guardar");
      }

      toast.success("Ficha clinica guardada exitosamente");
      const json = await res.json();
      if (json.data) setRecord(json.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar la ficha"
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleEvolution(id: string) {
    setExpandedEvolutions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getDocName(evo: Evolution): string {
    if (!evo.user) return "Profesional";
    const parts = [evo.user.firstName, evo.user.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return evo.user.name ?? "Profesional";
  }

  function getPrescDocName(p: Prescription): string {
    if (!p.user) return "Profesional";
    const parts = [p.user.firstName, p.user.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return p.user.name ?? "Profesional";
  }

  function parsePrescItems(items: string): PrescriptionItem[] {
    try {
      return JSON.parse(items);
    } catch {
      return [];
    }
  }

  /**
   * Pluralizes a Spanish label correctly.
   * Handles: "Plan alimentario" → "Planes alimentarios",
   *          "Evolución" → "Evoluciones", "Receta" → "Recetas",
   *          "Registro nutricional" → "Registros nutricionales",
   *          "Nota de sesión" → "Notas de sesiones", etc.
   * Prepositions and articles (de, del, la, el, las, los) are left unchanged.
   */
  function pluralizeLabel(label: string): string {
    // Words that should not be pluralized (prepositions, articles, conjunctions)
    const STOPWORDS = new Set(["de", "del", "la", "el", "las", "los", "y", "e", "o", "u"]);

    const words = label.trim().split(/\s+/);

    const pluralizeWord = (word: string): string => {
      const lower = word.toLowerCase();
      if (STOPWORDS.has(lower)) return word;
      if (word.endsWith("ón") || word.endsWith("ión")) {
        return word.slice(0, -2) + "ones";
      }
      if (/[aeiouáéíóú]$/i.test(word)) {
        return word + "s";
      }
      return word + "es";
    };

    return words.map(pluralizeWord).join(" ");
  }

  /** Returns the patient's age in years, or null if birthDate is not available. */
  function calcPatientAge(): number | null {
    if (!patient?.birthDate) return null;
    const birth = new Date(patient.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  // Determine if the current profession uses meal plans instead of prescriptions
  const isMealPlanMode = labels.prescriptionLabel.toLowerCase().includes("plan alimentario") ||
    labels.prescriptionLabel.toLowerCase().includes("plan nutricional");

  const sortedPrescriptions = [...prescriptions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const sortedMealPlans = [...mealPlans].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  function getMealPlanDocName(mp: MealPlan): string {
    if (!mp.user) return "Profesional";
    const parts = [mp.user.firstName, mp.user.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return mp.user.name ?? "Profesional";
  }

  function parseMealSections(meals: string): MealSection[] {
    try {
      return JSON.parse(meals);
    } catch {
      return [];
    }
  }

  const filteredEvolutions = evolutions
    .filter((evo) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (evo.reason?.toLowerCase().includes(q) ?? false) ||
        (evo.diagnosis?.toLowerCase().includes(q) ?? false) ||
        (evo.diagnosisCode?.toLowerCase().includes(q) ?? false) ||
        (evo.treatment?.toLowerCase().includes(q) ?? false) ||
        (evo.notes?.toLowerCase().includes(q) ?? false) ||
        getDocName(evo).toLowerCase().includes(q)
      );
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              router.push(`/dashboard/pacientes/${patientId}`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {labels.clinicalRecordLabel}
            </h1>
            <p className="text-muted-foreground">
              {patient.lastName}, {patient.firstName}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ficha" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ficha">{labels.clinicalRecordLabel}</TabsTrigger>
          <TabsTrigger value="evoluciones">{pluralizeLabel(labels.evolutionLabel)}</TabsTrigger>
          {prescriptionsEnabled && (
            <TabsTrigger value="recetas">{pluralizeLabel(labels.prescriptionLabel)}</TabsTrigger>
          )}
        </TabsList>

        {/* Tab: Ficha Clinica */}
        <TabsContent value="ficha">
          <Card>
            <CardHeader>
              <CardTitle>{labels.clinicalRecordLabel}</CardTitle>
            </CardHeader>
            <CardContent className="max-w-3xl space-y-6">
              {/* Blood Type */}
              <div className="space-y-2">
                <Label htmlFor="bloodType">Grupo sanguineo</Label>
                <Select value={bloodType} onValueChange={setBloodType}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_TYPES.map((bt) => (
                      <SelectItem key={bt} value={bt}>
                        {bt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Allergies */}
              <div className="space-y-2">
                <Label htmlFor="allergies">Alergias</Label>
                <Textarea
                  id="allergies"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="Alergias conocidas..."
                  rows={3}
                />
              </div>

              {/* Personal History */}
              <div className="space-y-2">
                <Label htmlFor="personalHistory">
                  Antecedentes personales
                </Label>
                <Textarea
                  id="personalHistory"
                  value={personalHistory}
                  onChange={(e) => setPersonalHistory(e.target.value)}
                  placeholder="Antecedentes personales del paciente..."
                  rows={3}
                />
              </div>

              {/* Family History */}
              <div className="space-y-2">
                <Label htmlFor="familyHistory">
                  Antecedentes familiares
                </Label>
                <Textarea
                  id="familyHistory"
                  value={familyHistory}
                  onChange={(e) => setFamilyHistory(e.target.value)}
                  placeholder="Antecedentes familiares relevantes..."
                  rows={3}
                />
              </div>

              {/* Current Medication */}
              <div className="space-y-2">
                <Label htmlFor="currentMedication">
                  Medicacion actual
                </Label>
                <Textarea
                  id="currentMedication"
                  value={currentMedication}
                  onChange={(e) => setCurrentMedication(e.target.value)}
                  placeholder="Medicacion que toma actualmente..."
                  rows={3}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales..."
                  rows={3}
                />
              </div>

              {/* Odontogram — only for dental professionals */}
              {/* Odontogram — dental professionals */}
              {hasDentalConfig && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Odontograma</Label>
                    <OdontogramEditor
                      value={odontogramData}
                      onChange={setOdontogramData}
                    />
                  </div>
                </>
              )}

              {/* Anthropometric tracker — nutritionists */}
              {hasAnthropometricConfig && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Seguimiento Antropometrico</Label>
                    <AnthropometricTracker
                      value={anthropometricData}
                      onChange={setAnthropometricData}
                    />
                  </div>
                </>
              )}

              {/* Genogram — psychologists */}
              {hasGenogramConfig && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Genograma Familiar</Label>
                    <GenogramEditor
                      value={genogramData}
                      onChange={setGenogramData}
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveRecord} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Evoluciones */}
        <TabsContent value="evoluciones">
          <div className="space-y-4">
            {/* Search + Create */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar evoluciones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => setEvolutionDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva {labels.evolutionLabel}
              </Button>
            </div>

            {/* Evolutions list */}
            {filteredEvolutions.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-sm text-muted-foreground">
                    {evolutions.length === 0
                      ? `No hay ${labels.evolutionLabel.toLowerCase()}s registradas para este paciente.`
                      : `No se encontraron ${labels.evolutionLabel.toLowerCase()}s con ese criterio de busqueda.`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredEvolutions.map((evo) => {
                  const isExpanded = expandedEvolutions.has(evo.id);
                  const date = new Date(evo.createdAt);
                  const hasDetails =
                    evo.physicalExam ||
                    evo.treatment ||
                    evo.indications ||
                    evo.notes;

                  return (
                    <Card
                      key={evo.id}
                      className="cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => toggleEvolution(evo.id)}
                    >
                      <CardContent className="p-4">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-1">
                            {/* Date + Doctor */}
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>
                                  {date.toLocaleDateString("es-AR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                <span>
                                  {date.toLocaleTimeString("es-AR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Stethoscope className="h-3.5 w-3.5" />
                                <span>{getDocName(evo)}</span>
                              </div>
                            </div>

                            {/* Linked shift */}
                            {evo.shift && (
                              <p className="text-xs text-muted-foreground">
                                Turno:{" "}
                                {new Date(
                                  evo.shift.start
                                ).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}{" "}
                                -{" "}
                                {new Date(
                                  evo.shift.end
                                ).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            )}

                            {/* Diagnosis badge */}
                            {evo.diagnosis && (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {evo.diagnosis}
                                  {evo.diagnosisCode &&
                                    ` (${evo.diagnosisCode})`}
                                </Badge>
                              </div>
                            )}

                            {/* Reason */}
                            {evo.reason && (
                              <p className="text-sm font-medium">
                                {evo.reason}
                              </p>
                            )}
                          </div>

                          {/* Expand icon */}
                          {hasDetails && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleEvolution(evo.id);
                              }}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>

                        {/* Expanded details */}
                        {isExpanded && hasDetails && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            {evo.physicalExam && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Examen fisico
                                </p>
                                <p className="mt-1 text-sm whitespace-pre-wrap">
                                  {evo.physicalExam}
                                </p>
                              </div>
                            )}
                            {evo.treatment && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Tratamiento
                                </p>
                                <p className="mt-1 text-sm whitespace-pre-wrap">
                                  {evo.treatment}
                                </p>
                              </div>
                            )}
                            {evo.indications && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Indicaciones
                                </p>
                                <p className="mt-1 text-sm whitespace-pre-wrap">
                                  {evo.indications}
                                </p>
                              </div>
                            )}
                            {evo.notes && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Notas
                                </p>
                                <p className="mt-1 text-sm whitespace-pre-wrap">
                                  {evo.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
        {/* Tab: Recetas / Planes alimentarios */}
        {prescriptionsEnabled && (
          <TabsContent value="recetas">
            {isMealPlanMode ? (
              /* ── Meal Plans mode ── */
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {sortedMealPlans.length}{" "}
                    {sortedMealPlans.length === 1
                      ? labels.prescriptionLabel.toLowerCase()
                      : `${labels.prescriptionLabel.toLowerCase()}s`}
                  </p>
                  <Button onClick={() => setMealPlanDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo {labels.prescriptionLabel}
                  </Button>
                </div>

                {/* List */}
                {sortedMealPlans.length === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <UtensilsCrossed className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <p className="mt-4 font-medium text-foreground">
                          No hay {labels.prescriptionLabel.toLowerCase()}s registrados
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Crea el primer {labels.prescriptionLabel.toLowerCase()} para este paciente.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {sortedMealPlans.map((mp) => {
                      const date = new Date(mp.createdAt);
                      const meals = parseMealSections(mp.meals);
                      const docName = getMealPlanDocName(mp);

                      return (
                        <Card key={mp.id} className="transition-colors hover:bg-accent/50">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 space-y-2">
                                {/* Date + Doctor */}
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>
                                      {date.toLocaleDateString("es-AR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Stethoscope className="h-3.5 w-3.5" />
                                    <span>{docName}</span>
                                  </div>
                                </div>

                                {/* Title */}
                                <p className="text-sm font-medium">{mp.title}</p>

                                {/* Macro badges */}
                                <div className="flex flex-wrap gap-1.5">
                                  {mp.targetCalories && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                                      {mp.targetCalories} kcal
                                    </span>
                                  )}
                                  {meals.length > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                                      <UtensilsCrossed className="h-3 w-3" />
                                      {meals.length} comidas
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setViewingMealPlan(mp)}
                                >
                                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                                  Ver
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingMealPlan(mp);
                                    setMealPlanDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  title="Duplicar"
                                  onClick={async () => {
                                    try {
                                      const meals = typeof mp.meals === "string" ? JSON.parse(mp.meals) : mp.meals;
                                      const res = await fetch("/api/meal-plans", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          userId: mp.userId,
                                          patientId: mp.patientId,
                                          title: "Copia de " + mp.title,
                                          targetCalories: mp.targetCalories ?? undefined,
                                          proteinPct: mp.proteinPct ?? undefined,
                                          carbsPct: mp.carbsPct ?? undefined,
                                          fatPct: mp.fatPct ?? undefined,
                                          hydration: mp.hydration ?? undefined,
                                          meals,
                                          avoidFoods: mp.avoidFoods ?? undefined,
                                          supplements: mp.supplements ?? undefined,
                                          notes: mp.notes ?? undefined,
                                          shiftId: mp.shiftId ?? undefined,
                                        }),
                                      });
                                      if (!res.ok) throw new Error();
                                      toast.success("Plan duplicado exitosamente");
                                      fetchData();
                                    } catch {
                                      toast.error("Error al duplicar el plan");
                                    }
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={async () => {
                                    if (!confirm("Eliminar este plan alimentario?")) return;
                                    try {
                                      const res = await fetch(`/api/meal-plans/${mp.id}`, { method: "DELETE" });
                                      if (!res.ok) throw new Error();
                                      toast.success("Plan eliminado");
                                      fetchData();
                                    } catch {
                                      toast.error("Error al eliminar");
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ── Prescriptions mode (original) ── */
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {sortedPrescriptions.length}{" "}
                    {sortedPrescriptions.length === 1
                      ? labels.prescriptionLabel.toLowerCase()
                      : `${labels.prescriptionLabel.toLowerCase()}s`}
                  </p>
                  <Button onClick={() => setPrescriptionDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva {labels.prescriptionLabel}
                  </Button>
                </div>

                {/* List */}
                {sortedPrescriptions.length === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <Pill className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <p className="mt-4 font-medium text-foreground">
                          No hay {labels.prescriptionLabel.toLowerCase()}s registradas
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Crea la primera {labels.prescriptionLabel.toLowerCase()} para este paciente.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {sortedPrescriptions.map((presc) => {
                      const date = new Date(presc.createdAt);
                      const items = parsePrescItems(presc.items);
                      const docName = getPrescDocName(presc);

                      return (
                        <Card key={presc.id} className="transition-colors hover:bg-accent/50">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 space-y-2">
                                {/* Date + Doctor */}
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>
                                      {date.toLocaleDateString("es-AR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Stethoscope className="h-3.5 w-3.5" />
                                    <span>{docName}</span>
                                  </div>
                                </div>

                                {/* Diagnosis */}
                                {presc.diagnosis && (
                                  <Badge variant="secondary" className="text-xs">
                                    {presc.diagnosis}
                                  </Badge>
                                )}

                                {/* Items summary */}
                                <div className="flex flex-wrap gap-1.5">
                                  {items.map((item, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                                    >
                                      <Pill className="h-3 w-3" />
                                      {item.medication} - {item.dose}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* View/Print button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewingPrescription(presc)}
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                Ver / Imprimir
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Prescription Dialogs */}
      {prescriptionsEnabled && !isMealPlanMode && (
        <>
          <CreatePrescriptionDialog
            open={prescriptionDialogOpen}
            onOpenChange={setPrescriptionDialogOpen}
            patientId={patientId}
            patientName={patient ? `${patient.lastName}, ${patient.firstName}` : "Paciente"}
            userId={sessionUserId}
            onCreated={() => {
              setPrescriptionDialogOpen(false);
              fetchData();
            }}
          />

          <Dialog
            open={!!viewingPrescription}
            onOpenChange={(val) => { if (!val) setViewingPrescription(null); }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
              <DialogHeader>
                <DialogTitle>{labels.prescriptionLabel}</DialogTitle>
              </DialogHeader>
              {viewingPrescription && (
                <PrescriptionView
                  prescription={viewingPrescription}
                  patientName={
                    patient ? `${patient.lastName}, ${patient.firstName}` : "Paciente"
                  }
                  patientDni={patient?.dni}
                  medicName={getPrescDocName(viewingPrescription)}
                  prescriptionLabel={labels.prescriptionLabel}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Meal Plan Dialogs */}
      {prescriptionsEnabled && isMealPlanMode && (
        <>
          <CreateMealPlanDialog
            open={mealPlanDialogOpen}
            onOpenChange={(v) => {
              setMealPlanDialogOpen(v);
              if (!v) setEditingMealPlan(null);
            }}
            patientId={patientId}
            patientName={patient ? `${patient.lastName}, ${patient.firstName}` : "Paciente"}
            userId={sessionUserId}
            editPlan={editingMealPlan}
            onCreated={() => {
              setMealPlanDialogOpen(false);
              setEditingMealPlan(null);
              fetchData();
            }}
          />

          <Dialog
            open={!!viewingMealPlan}
            onOpenChange={(val) => { if (!val) setViewingMealPlan(null); }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
              <DialogHeader>
                <DialogTitle>{labels.prescriptionLabel}</DialogTitle>
              </DialogHeader>
              {viewingMealPlan && (
                <MealPlanView
                  plan={viewingMealPlan}
                  prescriptionLabel={labels.prescriptionLabel}
                  patientName={
                    patient ? `${patient.lastName}, ${patient.firstName}` : undefined
                  }
                  patientAge={calcPatientAge()}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Evolution Dialog */}
      <EvolutionFormDialog
        open={evolutionDialogOpen}
        onOpenChange={setEvolutionDialogOpen}
        patientId={patientId}
        onCreated={() => {
          setEvolutionDialogOpen(false);
          fetchData();
        }}
      />
    </div>
  );
}
