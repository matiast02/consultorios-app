"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Calendar,
  FileText,
  HeartPulse,
  Salad,
  Smile,
  Stethoscope,
  Users,
  User as UserIcon,
} from "lucide-react";
import { PatientHeader } from "@/components/pacientes/patient-header";
import { PatientAlerts } from "@/components/pacientes/patient-alerts";
import { ResumenTab } from "@/components/pacientes/resumen-tab";
import { DatosTab } from "@/components/pacientes/datos-tab";
import { HistoriaTab } from "@/components/pacientes/historia-tab";
import { EvolucionesTab } from "@/components/pacientes/evoluciones-tab";
import { RecetasTab } from "@/components/pacientes/recetas-tab";
import { NutricionTab } from "@/components/pacientes/nutricion-tab";
import { OdontogramaTab } from "@/components/pacientes/odontograma-tab";
import { GenogramaTab } from "@/components/pacientes/genograma-tab";
import { TurnosTab } from "@/components/pacientes/turnos-tab";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { EvolutionFormDialog } from "@/components/clinical/evolution-form-dialog";
import { CreatePrescriptionDialog } from "@/components/prescriptions/create-prescription-dialog";
import { PrescriptionView } from "@/components/prescriptions/prescription-view";
import { CreateMealPlanDialog } from "@/components/nutrition/create-meal-plan-dialog";
import { MealPlanView } from "@/components/nutrition/meal-plan-view";
import { AnnulReasonDialog } from "@/components/clinical/annul-reason-dialog";
import { VersionHistoryDialog } from "@/components/clinical/version-history-dialog";
import { safeParseJSON, relTime } from "@/components/pacientes/shared";
import type {
  ClinicalRecord,
  Evolution,
  MealPlan,
  ModuleConfig,
  Patient,
  Prescription,
  Shift,
  StructuredAllergy,
} from "@/types";

const VALID_TABS = [
  "resumen",
  "datos",
  "historia",
  "evoluciones",
  "recetas",
  "nutricion",
  "odontograma",
  "genograma",
  "turnos",
] as const;
type TabId = (typeof VALID_TABS)[number];

function parseChronicMeds(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[\n,;·]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function PacienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const patientId = params.id as string;
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null;
  const isClinical = userRole !== "secretary"; // medics + admins can see clinical data

  // Secretaries can't access clinical tabs even via URL.
  // Resumen is hidden too because its sections are clinical-centric.
  const allowedTabs: readonly TabId[] = isClinical
    ? VALID_TABS
    : (["datos", "turnos"] as const);
  // Default tab depends on role: medics/admins land on Resumen (clinical-first),
  // secretaries land on Datos (administrative-first).
  const defaultTab: TabId = isClinical ? "resumen" : "datos";
  const tabParam = searchParams.get("tab") as TabId | null;
  const safeInitialTab: TabId =
    tabParam && allowedTabs.includes(tabParam) ? tabParam : defaultTab;
  const [tab, setTab] = useState<TabId>(safeInitialTab);

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [prescriptionsEnabled, setPrescriptionsEnabled] = useState(false);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [nutritionEnabled, setNutritionEnabled] = useState(false);
  const [odontogramEnabled, setOdontogramEnabled] = useState(false);
  const [genogramEnabled, setGenogramEnabled] = useState(false);

  // Dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [viewingPrescription, setViewingPrescription] = useState<Prescription | null>(null);
  const [mealPlanOpen, setMealPlanOpen] = useState(false);
  const [editingMealPlan, setEditingMealPlan] = useState<MealPlan | null>(null);
  const [viewingMealPlan, setViewingMealPlan] = useState<MealPlan | null>(null);
  // Inalterabilidad: anular / ver historial de asientos clínicos
  const [annulTarget, setAnnulTarget] = useState<{ endpoint: string; title: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ entityType: string; entityId: string; title: string } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      // Common (all roles): patient + shifts
      const pRes = await fetch(`/api/patients/${patientId}`);
      if (!pRes.ok) throw new Error("Paciente no encontrado");
      const pJson = await pRes.json();
      setPatient(pJson.data ?? pJson);

      const sRes = await fetch(`/api/shifts?patientId=${patientId}`);
      if (sRes.ok) {
        const sJson = await sRes.json();
        setShifts(Array.isArray(sJson.data) ? sJson.data : []);
      }

      // Clinical record: medics + admins get the full record; secretaries
      // get a redacted view from the backend (only structured allergies for
      // the safety alert), so we fetch it for everyone.
      const rRes = await fetch(`/api/patients/${patientId}/clinical-record`);
      if (rRes.ok) {
        const rJson = await rRes.json();
        setRecord(rJson.data ?? null);
      }

      // Evolutions, prescriptions and modules are clinical-only.
      if (isClinical) {
        const [eRes, mRes] = await Promise.all([
          fetch(`/api/patients/${patientId}/evolutions`),
          fetch(`/api/modules`),
        ]);

        if (eRes.ok) {
          const eJson = await eRes.json();
          setEvolutions(Array.isArray(eJson.data) ? eJson.data : []);
        }

        if (mRes.ok) {
          const mJson = await mRes.json();
          const modules: ModuleConfig[] = mJson.data ?? [];
          const presc = modules.find((m) => m.module === "prescriptions");
          if (presc?.enabled) {
            setPrescriptionsEnabled(true);
            const prRes = await fetch(`/api/prescriptions?patientId=${patientId}`);
            if (prRes.ok) {
              const prJson = await prRes.json();
              setPrescriptions(prJson.data ?? []);
            }
          }
        }

        // Nutrition: only for professionals whose profession enables the
        // anthropometric tracker (i.e. nutritionists). Meal plans share the
        // "prescriptions" module gate on the API side.
        if (sessionUserId) {
          const pcRes = await fetch(`/api/users/${sessionUserId}/profession-config`);
          if (pcRes.ok) {
            const pcJson = await pcRes.json();
            const fields = safeParseJSON<string[]>(pcJson.data?.clinicalFields ?? null, []);
            setOdontogramEnabled(fields.includes("odontogram"));
            setGenogramEnabled(fields.includes("genogram"));
            if (fields.includes("anthropometricTracker")) {
              setNutritionEnabled(true);
              const mpRes = await fetch(`/api/meal-plans?patientId=${patientId}`);
              if (mpRes.ok) {
                const mpJson = await mpRes.json();
                setMealPlans(Array.isArray(mpJson.data) ? mpJson.data : []);
              }
            }
          }
        }
      } else {
        // Reset clinical state for secretaries
        setEvolutions([]);
        setPrescriptions([]);
        setPrescriptionsEnabled(false);
        setMealPlans([]);
        setNutritionEnabled(false);
        setOdontogramEnabled(false);
        setGenogramEnabled(false);
      }
    } catch {
      toast.error("Error al cargar el paciente");
      router.push("/dashboard/pacientes");
    } finally {
      setLoading(false);
    }
  }, [patientId, router, isClinical, sessionUserId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Sync tab param to URL
  function changeTab(next: string) {
    if (!VALID_TABS.includes(next as TabId)) return;
    if (!allowedTabs.includes(next as TabId)) return;
    setTab(next as TabId);
    const sp = new URLSearchParams(searchParams.toString());
    // Drop ?tab=... when it equals the role's default to keep URLs clean
    if (next === defaultTab) sp.delete("tab");
    else sp.set("tab", next);
    const qs = sp.toString();
    router.replace(`/dashboard/pacientes/${patientId}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }

  // Derived values ────────────────────────────────────────────────────────
  const now = new Date();
  const sortedShifts = useMemo(
    () =>
      [...shifts].sort(
        (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
      ),
    [shifts],
  );
  const pastShifts = useMemo(
    () => sortedShifts.filter((s) => new Date(s.start) <= now),
    [sortedShifts, now],
  );
  const futureShifts = useMemo(
    () => sortedShifts.filter((s) => new Date(s.start) > now),
    [sortedShifts, now],
  );

  const lastShiftDate = pastShifts[0]?.start
    ? new Date(pastShifts[0].start)
    : null;
  const nextShift = futureShifts[futureShifts.length - 1] ?? null;

  const structuredAllergies = useMemo(
    () =>
      safeParseJSON<StructuredAllergy[]>(record?.structuredAllergies ?? null, []),
    [record?.structuredAllergies],
  );

  const severeAllergies = useMemo(
    () => structuredAllergies.filter((a) => a.severidad === "alta"),
    [structuredAllergies],
  );

  const chronicMedications = useMemo(
    () => parseChronicMeds(record?.currentMedication),
    [record?.currentMedication],
  );

  const activePrescriptions = useMemo(() => {
    if (!prescriptionsEnabled) return null;
    const now = new Date();
    let count = 0;
    let nextExpiry: Date | null = null;
    for (const p of prescriptions) {
      const days = p.durationDays ?? 90;
      const expiry = new Date(
        new Date(p.createdAt).getTime() + days * 24 * 60 * 60 * 1000,
      );
      if (expiry > now) {
        count++;
        if (!nextExpiry || expiry < nextExpiry) nextExpiry = expiry;
      }
    }
    return { count, nextExpiry };
  }, [prescriptions, prescriptionsEnabled]);

  // Tabs config ──────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: typeof UserIcon; count?: number }[] = [
    ...(isClinical
      ? [{ id: "resumen" as TabId, label: "Resumen", icon: HeartPulse }]
      : []),
    { id: "datos", label: "Datos", icon: UserIcon },
    ...(isClinical
      ? [
          { id: "historia" as TabId, label: "Historia clínica", icon: Stethoscope },
          {
            id: "evoluciones" as TabId,
            label: "Evoluciones",
            icon: Calendar,
            count: evolutions.length,
          },
        ]
      : []),
    ...(isClinical && prescriptionsEnabled
      ? [
          {
            id: "recetas" as TabId,
            label: "Recetas",
            icon: FileText,
            count: prescriptions.length,
          },
        ]
      : []),
    ...(isClinical && nutritionEnabled
      ? [
          {
            id: "nutricion" as TabId,
            label: "Nutrición",
            icon: Salad,
            count: mealPlans.length,
          },
        ]
      : []),
    ...(isClinical && odontogramEnabled
      ? [{ id: "odontograma" as TabId, label: "Odontograma", icon: Smile }]
      : []),
    ...(isClinical && genogramEnabled
      ? [{ id: "genograma" as TabId, label: "Genograma", icon: Users }]
      : []),
    { id: "turnos", label: "Turnos", icon: Calendar, count: shifts.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }
  if (!patient) return null;

  return (
    <div className="space-y-4">
      <PatientHeader
        patient={patient}
        totalShifts={shifts.length}
        lastShift={
          lastShiftDate
            ? { date: lastShiftDate, rel: relTime(lastShiftDate) }
            : null
        }
        nextShift={
          nextShift
            ? {
                date: new Date(nextShift.start),
                rel: relTime(new Date(nextShift.start)),
              }
            : null
        }
        activePrescriptions={activePrescriptions}
        onEdit={() => setEditOpen(true)}
        onNewShift={() => router.push(`/dashboard/turnos?patientId=${patientId}`)}
      />

      {(severeAllergies.length > 0 || chronicMedications.length > 0) && (
        <PatientAlerts
          severeAllergies={severeAllergies}
          chronicMedications={chronicMedications}
        />
      )}

      <Tabs value={tab} onValueChange={changeTab} className="w-full">
        <TabsList variant="pill">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              <span className="flex items-center gap-2">
                <t.icon className="h-4 w-4" />
                {t.label}
                {typeof t.count === "number" && t.count > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary">
                    {t.count}
                  </span>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {isClinical && (
          <TabsContent value="resumen" className="mt-5">
            <ResumenTab
              canManageClinical={isClinical}
              record={record}
              evolutions={evolutions}
              nextShift={nextShift}
              chronicMedications={chronicMedications}
              structuredAllergies={structuredAllergies}
              onNewEvolution={() => setEvolutionOpen(true)}
              onNewPrescription={() => setPrescriptionOpen(true)}
              onNewShift={() =>
                router.push(`/dashboard/turnos?patientId=${patientId}`)
              }
              onGoToEvolutions={() => changeTab("evoluciones")}
            />
          </TabsContent>
        )}

        <TabsContent value="datos" className="mt-5">
          <DatosTab patient={patient} onEdit={() => setEditOpen(true)} />
        </TabsContent>

        {isClinical && (
          <>
            <TabsContent value="historia" className="mt-5">
              <HistoriaTab
                patientId={patientId}
                record={record}
                onSaved={(next) => setRecord(next)}
              />
            </TabsContent>

            <TabsContent value="evoluciones" className="mt-5">
              <EvolucionesTab
                evolutions={evolutions}
                onNew={() => setEvolutionOpen(true)}
                currentUserId={sessionUserId}
                onAnnul={(e) =>
                  setAnnulTarget({
                    endpoint: `/api/patients/${patientId}/evolutions/${e.id}`,
                    title: "Anular evolución",
                  })
                }
                onHistory={(e) =>
                  setHistoryTarget({
                    entityType: "evolution",
                    entityId: e.id,
                    title: "Historial de la evolución",
                  })
                }
              />
            </TabsContent>

            {prescriptionsEnabled && (
              <TabsContent value="recetas" className="mt-5">
                <RecetasTab
                  prescriptions={prescriptions}
                  onNew={() => setPrescriptionOpen(true)}
                  onView={(p) => setViewingPrescription(p)}
                  currentUserId={sessionUserId}
                  onAnnul={(p) =>
                    setAnnulTarget({
                      endpoint: `/api/prescriptions/${p.id}`,
                      title: "Anular receta",
                    })
                  }
                  onHistory={(p) =>
                    setHistoryTarget({
                      entityType: "prescription",
                      entityId: p.id,
                      title: "Historial de la receta",
                    })
                  }
                />
              </TabsContent>
            )}

            {nutritionEnabled && (
              <TabsContent value="nutricion" className="mt-5">
                <NutricionTab
                  mealPlans={mealPlans}
                  currentUserId={sessionUserId}
                  onNew={() => {
                    setEditingMealPlan(null);
                    setMealPlanOpen(true);
                  }}
                  onView={(p) => setViewingMealPlan(p)}
                  onEdit={(p) => {
                    setEditingMealPlan(p);
                    setMealPlanOpen(true);
                  }}
                  onAnnul={(p) =>
                    setAnnulTarget({
                      endpoint: `/api/meal-plans/${p.id}`,
                      title: "Anular plan alimentario",
                    })
                  }
                  onHistory={(p) =>
                    setHistoryTarget({
                      entityType: "meal_plan",
                      entityId: p.id,
                      title: "Historial del plan",
                    })
                  }
                />
              </TabsContent>
            )}

            {odontogramEnabled && (
              <TabsContent value="odontograma" className="mt-5">
                <OdontogramaTab
                  patientId={patientId}
                  initialData={record?.odontogram ?? null}
                  onSaved={(json) =>
                    setRecord((r) => (r ? { ...r, odontogram: json } : r))
                  }
                />
              </TabsContent>
            )}

            {genogramEnabled && (
              <TabsContent value="genograma" className="mt-5">
                <GenogramaTab
                  patientId={patientId}
                  patientName={`${patient.firstName} ${patient.lastName}`}
                  initialData={record?.genogram ?? null}
                  onSaved={(json) =>
                    setRecord((r) => (r ? { ...r, genogram: json } : r))
                  }
                />
              </TabsContent>
            )}
          </>
        )}

        <TabsContent value="turnos" className="mt-5">
          <TurnosTab
            shifts={shifts}
            onNewShift={() =>
              router.push(`/dashboard/turnos?patientId=${patientId}`)
            }
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs ─────────────────────────────────────────────────────── */}
      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSaved={() => {
          setEditOpen(false);
          fetchAll();
        }}
      />

      {isClinical && (
        <EvolutionFormDialog
          open={evolutionOpen}
          onOpenChange={setEvolutionOpen}
          patientId={patientId}
          onCreated={() => {
            setEvolutionOpen(false);
            fetchAll();
          }}
        />
      )}

      {isClinical && prescriptionsEnabled && (
        <>
          <CreatePrescriptionDialog
            open={prescriptionOpen}
            onOpenChange={setPrescriptionOpen}
            patientId={patientId}
            patientName={`${patient.lastName}, ${patient.firstName}`}
            userId={sessionUserId}
            onCreated={() => {
              setPrescriptionOpen(false);
              fetchAll();
            }}
          />

          <Dialog
            open={!!viewingPrescription}
            onOpenChange={(v) => {
              if (!v) setViewingPrescription(null);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
              <DialogHeader>
                <DialogTitle>Receta</DialogTitle>
              </DialogHeader>
              {viewingPrescription && (
                <PrescriptionView
                  prescription={viewingPrescription}
                  patientName={`${patient.lastName}, ${patient.firstName}`}
                  patientDni={patient.dni ?? undefined}
                  medicName={
                    viewingPrescription.user?.firstName ||
                    viewingPrescription.user?.lastName
                      ? `${viewingPrescription.user.firstName ?? ""} ${viewingPrescription.user.lastName ?? ""}`.trim()
                      : viewingPrescription.user?.name ?? "Profesional"
                  }
                  prescriptionLabel="Receta"
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

      {isClinical && nutritionEnabled && (
        <>
          <CreateMealPlanDialog
            open={mealPlanOpen}
            onOpenChange={(v) => {
              setMealPlanOpen(v);
              if (!v) setEditingMealPlan(null);
            }}
            patientId={patientId}
            patientName={`${patient.lastName}, ${patient.firstName}`}
            userId={sessionUserId}
            editPlan={editingMealPlan}
            onCreated={() => {
              setMealPlanOpen(false);
              setEditingMealPlan(null);
              fetchAll();
            }}
          />

          <Dialog
            open={!!viewingMealPlan}
            onOpenChange={(v) => {
              if (!v) setViewingMealPlan(null);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
              <DialogHeader>
                <DialogTitle>Plan alimentario</DialogTitle>
              </DialogHeader>
              {viewingMealPlan && (
                <MealPlanView
                  plan={viewingMealPlan}
                  patientName={`${patient.lastName}, ${patient.firstName}`}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Inalterabilidad: anular evolución + ver historial de versiones */}
      {isClinical && (
        <>
          <AnnulReasonDialog
            open={!!annulTarget}
            onOpenChange={(v) => !v && setAnnulTarget(null)}
            endpoint={annulTarget?.endpoint ?? ""}
            title={annulTarget?.title ?? "Anular registro"}
            onAnnulled={() => {
              setAnnulTarget(null);
              fetchAll();
            }}
          />

          <VersionHistoryDialog
            open={!!historyTarget}
            onOpenChange={(v) => !v && setHistoryTarget(null)}
            entityType={historyTarget?.entityType ?? "evolution"}
            entityId={historyTarget?.entityId ?? null}
            title={historyTarget?.title ?? "Historial de versiones"}
          />
        </>
      )}
    </div>
  );
}
