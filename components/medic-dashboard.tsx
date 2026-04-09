"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { ScheduleSetupWizard } from "@/components/schedule-setup-wizard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { QuickAttendDialog } from "@/components/shifts/quick-attend-dialog";
import { RecurringShiftDialog } from "@/components/shifts/recurring-shift-dialog";
import { CreateShiftDialog } from "@/components/shifts/create-shift-dialog";
import {
  Stethoscope,
  Clock,
  CheckCircle,
  UserX,
  CalendarCheck,
  Loader2,
  FileText,
  ChevronRight,
  ChevronDown,
  Play,
  Users,
  CalendarDays,
  Pencil,
  ExternalLink,
  Heart,
  Pill,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import type { Shift, ShiftStatus, ClinicalRecord } from "@/types";
import { SHIFT_STATUS_LABELS, SHIFT_STATUS_COLORS, BLOOD_TYPES } from "@/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface MedicDashboardProps {
  userName: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_ORDER: Record<ShiftStatus, number> = {
  CONFIRMED: 0,
  PENDING: 1,
  FINISHED: 2,
  ABSENT: 3,
  CANCELLED: 4,
};

// ─── Inline Clinical Record Panel ────────────────────────────────────────────

function PatientClinicalPanel({ patientId }: { patientId: string }) {
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/patients/${patientId}/clinical-record`);
        if (res.ok) {
          const json = await res.json();
          setRecord(json.data ?? null);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData =
    record?.bloodType ||
    record?.allergies ||
    record?.currentMedication ||
    record?.personalHistory;
  const evolutions = record?.evolutions ?? [];

  return (
    <div className="space-y-3">
      {/* Quick info pills */}
      <div className="flex flex-wrap gap-2">
        {record?.bloodType && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Heart className="h-3 w-3 text-red-500" />
            {record.bloodType}
          </Badge>
        )}
        {record?.allergies && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-300 bg-amber-50 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          >
            <AlertTriangle className="h-3 w-3" />
            Alergias: {record.allergies.substring(0, 40)}
            {record.allergies.length > 40 ? "..." : ""}
          </Badge>
        )}
        {record?.currentMedication && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Pill className="h-3 w-3 text-blue-500" />
            Medicacion: {record.currentMedication.substring(0, 40)}
            {record.currentMedication.length > 40 ? "..." : ""}
          </Badge>
        )}
      </div>

      {/* Antecedentes */}
      {record?.personalHistory && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Antecedentes
          </p>
          <p className="mt-0.5 text-xs text-foreground/80">
            {record.personalHistory.substring(0, 120)}
            {record.personalHistory.length > 120 ? "..." : ""}
          </p>
        </div>
      )}

      {/* Last evolutions */}
      {evolutions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ultimas consultas
          </p>
          <div className="mt-1 space-y-1.5">
            {evolutions.slice(0, 3).map((evo) => (
              <div
                key={evo.id}
                className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {format(new Date(evo.createdAt), "dd/MM/yy")}
                  </span>
                  {evo.diagnosis && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {evo.diagnosis.substring(0, 30)}
                    </Badge>
                  )}
                </div>
                {evo.reason && (
                  <p className="mt-0.5 text-foreground/70">
                    {evo.reason.substring(0, 80)}
                    {evo.reason.length > 80 ? "..." : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasData && evolutions.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin historia clinica registrada
        </p>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export function MedicDashboard({ userName }: MedicDashboardProps) {
  const { data: session } = useSession();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendShift, setAttendShift] = useState<Shift | null>(null);
  const [scheduleNext, setScheduleNext] = useState<{
    patientId: string;
    medicId: string;
  } | null>(null);
  const [scheduleRecurring, setScheduleRecurring] = useState<{
    patientId: string;
    patientName: string;
    medicId: string;
  } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editingObsText, setEditingObsText] = useState("");
  const [savingObs, setSavingObs] = useState(false);
  const [needsScheduleSetup, setNeedsScheduleSetup] = useState(false);
  const [checkingSchedule, setCheckingSchedule] = useState(true);
  const [rescheduledShifts, setRescheduledShifts] = useState<Shift[]>([]);
  const [dismissedRescheduled, setDismissedRescheduled] = useState(false);

  const userId = (session?.user as { id?: string } | undefined)?.id;

  // Check if medic has configured their schedule
  useEffect(() => {
    if (!userId) return;
    async function checkSchedule() {
      try {
        const res = await fetch(`/api/users/${userId}/has-schedule`);
        if (res.ok) {
          const json = await res.json();
          setNeedsScheduleSetup(!json.data?.hasSchedule);
        }
      } catch {
        // Non-critical, don't block
      } finally {
        setCheckingSchedule(false);
      }
    }
    checkSchedule();
  }, [userId]);

  // Fetch rescheduled shifts
  useEffect(() => {
    async function loadRescheduled() {
      try {
        const res = await fetch("/api/shifts/rescheduled");
        if (res.ok) {
          const json = await res.json();
          setRescheduledShifts(json.data ?? []);
        }
      } catch {
        // Non-critical
      }
    }
    loadRescheduled();
  }, []);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        month: String(today.getMonth() + 1),
        year: String(today.getFullYear()),
      });
      const res = await fetch(`/api/shifts?${params}`);
      if (!res.ok) throw new Error("Error al cargar turnos");
      const json = await res.json();
      setShifts(json.data ?? []);
    } catch {
      toast.error("No se pudieron cargar los turnos");
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const todayShifts = shifts
    .filter((s) => isSameDay(new Date(s.start), today))
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

  const tomorrowShifts = shifts
    .filter((s) => isSameDay(new Date(s.start), tomorrow))
    .sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

  const totalToday = todayShifts.length;
  const finished = todayShifts.filter((s) => s.status === "FINISHED").length;
  const pending = todayShifts.filter(
    (s) => s.status === "PENDING" || s.status === "CONFIRMED"
  ).length;
  const absent = todayShifts.filter((s) => s.status === "ABSENT").length;

  async function changeStatus(shiftId: string, status: ShiftStatus) {
    try {
      setUpdatingId(shiftId);
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al cambiar estado");
      }
      toast.success(
        `Turno marcado como ${SHIFT_STATUS_LABELS[status].toLowerCase()}`
      );
      fetchShifts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar"
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveObservations(shiftId: string) {
    try {
      setSavingObs(true);
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observations: editingObsText || null }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success("Observaciones actualizadas");
      setEditingObsId(null);
      fetchShifts();
    } catch {
      toast.error("Error al guardar observaciones");
    } finally {
      setSavingObs(false);
    }
  }

  function toggleExpand(shiftId: string) {
    setExpandedShiftId((prev) => (prev === shiftId ? null : shiftId));
  }

  const statCards = [
    {
      label: "Turnos hoy",
      value: totalToday,
      icon: CalendarCheck,
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-l-primary",
    },
    {
      label: "Pendientes",
      value: pending,
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      border: "border-l-amber-500",
    },
    {
      label: "Atendidos",
      value: finished,
      icon: CheckCircle,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      border: "border-l-emerald-500",
    },
    {
      label: "Ausentes",
      value: absent,
      icon: UserX,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-950/40",
      border: "border-l-red-500",
    },
  ];

  if (checkingSchedule) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schedule setup wizard for first-time medics */}
      {userId && (
        <ScheduleSetupWizard
          open={needsScheduleSetup}
          userId={userId}
          userName={userName}
          mandatory
          onComplete={() => {
            setNeedsScheduleSetup(false);
          }}
        />
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-primary/5 to-transparent"
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary">
            <Stethoscope className="h-5 w-5" />
            <span className="text-sm font-medium">Mi Consultorio</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {userName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(today, "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </div>
      ) : (
        <>
          {/* Rescheduled shifts notification */}
          {rescheduledShifts.length > 0 && !dismissedRescheduled && (
            <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        {rescheduledShifts.length} turno(s) reprogramado(s) automaticamente
                      </p>
                      <div className="space-y-1">
                        {rescheduledShifts.slice(0, 3).map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                            <span className="font-medium">
                              {s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : "Paciente"}
                            </span>
                            <span>
                              {s.rescheduledFrom && format(new Date(s.rescheduledFrom), "dd/MM", { locale: es })}
                            </span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="font-medium">
                              {format(new Date(s.start), "dd/MM HH:mm", { locale: es })}
                            </span>
                          </div>
                        ))}
                        {rescheduledShifts.length > 3 && (
                          <p className="text-xs text-amber-600">
                            y {rescheduledShifts.length - 3} mas...
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-amber-700 hover:text-amber-900 shrink-0"
                    onClick={() => setDismissedRescheduled(true)}
                  >
                    Entendido
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {statCards.map((card) => (
              <Card
                key={card.label}
                className={`border-l-4 ${card.border} shadow-sm`}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.bg}`}
                  >
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{card.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {card.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Today's Queue */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base">
                    Turnos de hoy
                    {totalToday > 0 && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({finished}/{totalToday} atendidos)
                      </span>
                    )}
                  </CardTitle>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/calendario">
                    <CalendarDays className="mr-2 h-3.5 w-3.5" />
                    Ver calendario
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {todayShifts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <CalendarCheck className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="mt-4 font-medium">No hay turnos para hoy</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tu agenda esta libre.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayShifts.map((shift) => {
                    const start = new Date(shift.start);
                    const end = new Date(shift.end);
                    const isDone =
                      shift.status === "FINISHED" ||
                      shift.status === "ABSENT" ||
                      shift.status === "CANCELLED";
                    const isUpdating = updatingId === shift.id;
                    const isExpanded = expandedShiftId === shift.id;
                    const isEditingObs = editingObsId === shift.id;

                    return (
                      <div
                        key={shift.id}
                        className={`rounded-lg border transition-all ${
                          shift.status === "CONFIRMED"
                            ? "border-primary/30 bg-primary/5 shadow-sm"
                            : isDone
                              ? "border-border bg-muted/30"
                              : "border-border bg-card"
                        }`}
                      >
                        {/* Main row */}
                        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-4">
                            {/* Expand toggle */}
                            <button
                              onClick={() =>
                                shift.patient && toggleExpand(shift.id)
                              }
                              className="flex items-center gap-4 text-left"
                            >
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                                  isExpanded ? "rotate-0" : "-rotate-90"
                                }`}
                              />
                              <div className="text-center">
                                <p className="text-lg font-bold leading-none">
                                  {formatTime(start)}
                                </p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {formatTime(end)}
                                </p>
                              </div>
                              <Separator
                                orientation="vertical"
                                className="h-10"
                              />
                              <div>
                                <p className="font-medium">
                                  {shift.patient
                                    ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                                    : "Paciente"}
                                </p>
                                <div className="mt-0.5 flex items-center gap-2">
                                  {shift.patient?.dni && (
                                    <span className="text-xs text-muted-foreground">
                                      DNI: {shift.patient.dni}
                                    </span>
                                  )}
                                  {shift.patient?.os && (
                                    <span className="text-xs text-muted-foreground">
                                      — {shift.patient.os.name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 sm:shrink-0">
                            {shift.isOverbook && (
                              <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                                ST
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-xs ${SHIFT_STATUS_COLORS[shift.status]}`}
                            >
                              {SHIFT_STATUS_LABELS[shift.status]}
                            </Badge>

                            {shift.status === "PENDING" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    changeStatus(shift.id, "CONFIRMED")
                                  }
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  Confirmar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    changeStatus(shift.id, "ABSENT")
                                  }
                                >
                                  <UserX className="mr-1.5 h-3.5 w-3.5" />
                                  Ausente
                                </Button>
                              </>
                            )}

                            {shift.status === "CONFIRMED" && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={isUpdating}
                                  onClick={() => setAttendShift(shift)}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Play className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  Atender
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    changeStatus(shift.id, "ABSENT")
                                  }
                                >
                                  <UserX className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}

                            {shift.status === "FINISHED" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs"
                                onClick={() => {
                                  setEditingObsId(shift.id);
                                  setEditingObsText(
                                    shift.observations ?? ""
                                  );
                                }}
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                Editar obs.
                              </Button>
                            )}

                            {shift.status === "ABSENT" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs"
                                disabled={isUpdating}
                                onClick={() =>
                                  changeStatus(shift.id, "CONFIRMED")
                                }
                              >
                                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                                Revertir
                              </Button>
                            )}

                            {shift.patient && (
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="text-primary"
                              >
                                <Link
                                  href={`/dashboard/pacientes/${shift.patientId}/historia-clinica`}
                                  target="_blank"
                                >
                                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                  HC
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Inline edit observations */}
                        {isEditingObs && (
                          <div className="border-t px-4 py-3">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Editar observaciones
                            </p>
                            <Textarea
                              value={editingObsText}
                              onChange={(e) =>
                                setEditingObsText(e.target.value)
                              }
                              rows={3}
                              className="mb-2 resize-y text-sm"
                              placeholder="Observaciones de la consulta..."
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => saveObservations(shift.id)}
                                disabled={savingObs}
                              >
                                {savingObs && (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                )}
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingObsId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Observations preview (when not editing) */}
                        {shift.status === "FINISHED" &&
                          shift.observations &&
                          !isEditingObs && (
                            <div className="border-t px-4 py-2">
                              <p className="text-xs text-muted-foreground italic">
                                {shift.observations}
                              </p>
                            </div>
                          )}

                        {/* Expanded clinical record panel */}
                        {isExpanded && shift.patient && (
                          <div className="border-t bg-muted/20 px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-semibold text-primary">
                                <FileText className="mr-1 inline h-3.5 w-3.5" />
                                Historia Clinica — {shift.patient.firstName}{" "}
                                {shift.patient.lastName}
                              </p>
                              <Button
                                asChild
                                size="sm"
                                variant="link"
                                className="h-auto p-0 text-xs"
                              >
                                <Link
                                  href={`/dashboard/pacientes/${shift.patientId}/historia-clinica`}
                                  target="_blank"
                                >
                                  Ver completa
                                  <ExternalLink className="ml-1 h-3 w-3" />
                                </Link>
                              </Button>
                            </div>
                            <PatientClinicalPanel
                              patientId={shift.patientId}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tomorrow */}
          {tomorrowShifts.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base text-muted-foreground">
                    Manana —{" "}
                    {format(tomorrow, "EEEE d", { locale: es })}
                    <span className="ml-2 text-sm font-normal">
                      ({tomorrowShifts.length}{" "}
                      {tomorrowShifts.length === 1 ? "turno" : "turnos"})
                    </span>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {tomorrowShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatTime(new Date(shift.start))}
                        </span>
                        <span className="font-medium">
                          {shift.patient
                            ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                            : "Paciente"}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${SHIFT_STATUS_COLORS[shift.status]}`}
                      >
                        {SHIFT_STATUS_LABELS[shift.status]}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {attendShift && (
        <QuickAttendDialog
          open={!!attendShift}
          onOpenChange={(open) => {
            if (!open) {
              setAttendShift(null);
              fetchShifts();
            }
          }}
          shift={attendShift}
          onSaved={() => {
            fetchShifts();
          }}
          onScheduleNext={(patientId, medicId) => {
            setAttendShift(null);
            setScheduleNext({ patientId, medicId });
          }}
          onScheduleRecurring={(patientId, medicId) => {
            const shift = attendShift;
            setAttendShift(null);
            const pName = shift?.patient
              ? `${shift.patient.lastName}, ${shift.patient.firstName}`
              : "Paciente";
            setScheduleRecurring({ patientId, medicId, patientName: pName });
          }}
        />
      )}

      {scheduleNext && (
        <CreateShiftDialog
          open={!!scheduleNext}
          onOpenChange={(open) => {
            if (!open) setScheduleNext(null);
          }}
          defaultPatientId={scheduleNext.patientId}
          defaultMedicId={scheduleNext.medicId}
          onCreated={() => {
            setScheduleNext(null);
            fetchShifts();
          }}
        />
      )}

      {scheduleRecurring && (
        <RecurringShiftDialog
          open={!!scheduleRecurring}
          onOpenChange={(open) => {
            if (!open) setScheduleRecurring(null);
          }}
          patientId={scheduleRecurring.patientId}
          patientName={scheduleRecurring.patientName}
          medicId={scheduleRecurring.medicId}
          medicName={userName}
          onCreated={() => {
            setScheduleRecurring(null);
            fetchShifts();
          }}
        />
      )}
    </div>
  );
}
