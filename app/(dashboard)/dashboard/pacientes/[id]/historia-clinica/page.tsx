"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { EvolutionFormDialog } from "@/components/clinical/evolution-form-dialog";
import { CreatePrescriptionDialog } from "@/components/prescriptions/create-prescription-dialog";
import { PrescriptionView } from "@/components/prescriptions/prescription-view";
import type { Patient, ClinicalRecord, Evolution, Prescription, PrescriptionItem, ModuleConfig } from "@/types";
import { BLOOD_TYPES } from "@/types";

export default function HistoriaClinicaPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

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

  // Form state for clinical record
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [personalHistory, setPersonalHistory] = useState("");
  const [familyHistory, setFamilyHistory] = useState("");
  const [currentMedication, setCurrentMedication] = useState("");
  const [notes, setNotes] = useState("");

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
        }
      }

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

  const sortedPrescriptions = [...prescriptions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

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
              Historia Clinica
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
          <TabsTrigger value="ficha">Ficha Clinica</TabsTrigger>
          <TabsTrigger value="evoluciones">Evoluciones</TabsTrigger>
          {prescriptionsEnabled && (
            <TabsTrigger value="recetas">Recetas</TabsTrigger>
          )}
        </TabsList>

        {/* Tab: Ficha Clinica */}
        <TabsContent value="ficha">
          <Card>
            <CardHeader>
              <CardTitle>Ficha Clinica</CardTitle>
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
                Nueva Evolucion
              </Button>
            </div>

            {/* Evolutions list */}
            {filteredEvolutions.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-sm text-muted-foreground">
                    {evolutions.length === 0
                      ? "No hay evoluciones registradas para este paciente."
                      : "No se encontraron evoluciones con ese criterio de busqueda."}
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
        {/* Tab: Recetas */}
        {prescriptionsEnabled && (
          <TabsContent value="recetas">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {sortedPrescriptions.length}{" "}
                  {sortedPrescriptions.length === 1 ? "receta" : "recetas"}
                </p>
                <Button onClick={() => setPrescriptionDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Receta
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
                        No hay recetas registradas
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Crea la primera receta para este paciente.
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
          </TabsContent>
        )}
      </Tabs>

      {/* Prescription Dialogs */}
      {prescriptionsEnabled && (
        <>
          <CreatePrescriptionDialog
            open={prescriptionDialogOpen}
            onOpenChange={setPrescriptionDialogOpen}
            patientId={patientId}
            patientName={patient ? `${patient.lastName}, ${patient.firstName}` : "Paciente"}
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
                <DialogTitle>Receta Medica</DialogTitle>
              </DialogHeader>
              {viewingPrescription && (
                <PrescriptionView
                  prescription={viewingPrescription}
                  patientName={
                    patient ? `${patient.lastName}, ${patient.firstName}` : "Paciente"
                  }
                  patientDni={patient?.dni}
                  medicName={getPrescDocName(viewingPrescription)}
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
