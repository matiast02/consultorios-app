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
import { QuickAttendDialog } from "@/components/shifts/quick-attend-dialog";
import { RecurringShiftDialog } from "@/components/shifts/recurring-shift-dialog";
import { CreateShiftDialog } from "@/components/shifts/create-shift-dialog";
import { CreateStudyOrderDialog } from "@/components/study-orders/create-study-order-dialog";
import { StatCard } from "@/components/dashboard/stat-card";
import { RescheduledBanner } from "@/components/dashboard/rescheduled-banner";
import { ShiftListItem } from "@/components/dashboard/shift-list-item";
import {
  Stethoscope,
  Clock,
  CheckCircle,
  UserX,
  CalendarCheck,
  Loader2,
  ChevronRight,
  Users,
  CalendarDays,
} from "lucide-react";
import type { Shift, ShiftStatus } from "@/types";
import { SHIFT_STATUS_LABELS, SHIFT_STATUS_COLORS } from "@/types";
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
  const [createStudyOrder, setCreateStudyOrder] = useState<{
    patientId: string;
    patientName: string;
    shiftId: string;
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
          {!dismissedRescheduled && (
            <RescheduledBanner
              shifts={rescheduledShifts}
              maxVisible={3}
              onDismiss={() => setDismissedRescheduled(true)}
            />
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} />
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
                  {todayShifts.map((shift) => (
                    <ShiftListItem
                      key={shift.id}
                      shift={shift}
                      isExpanded={expandedShiftId === shift.id}
                      isUpdating={updatingId === shift.id}
                      isEditingObs={editingObsId === shift.id}
                      editingObsText={editingObsText}
                      savingObs={savingObs}
                      onToggleExpand={toggleExpand}
                      onChangeStatus={changeStatus}
                      onAttend={setAttendShift}
                      onStartEditObs={(id, text) => {
                        setEditingObsId(id);
                        setEditingObsText(text);
                      }}
                      onCancelEditObs={() => setEditingObsId(null)}
                      onSaveObs={saveObservations}
                      onObsTextChange={setEditingObsText}
                    />
                  ))}
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
          onCreateStudyOrder={(patientId, shiftId) => {
            const shift = attendShift;
            setAttendShift(null);
            const pName = shift?.patient
              ? `${shift.patient.lastName}, ${shift.patient.firstName}`
              : "Paciente";
            setCreateStudyOrder({ patientId, patientName: pName, shiftId });
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

      {createStudyOrder && (
        <CreateStudyOrderDialog
          open={!!createStudyOrder}
          onOpenChange={(open) => {
            if (!open) setCreateStudyOrder(null);
          }}
          patientId={createStudyOrder.patientId}
          patientName={createStudyOrder.patientName}
          shiftId={createStudyOrder.shiftId}
          onCreated={() => {
            setCreateStudyOrder(null);
          }}
        />
      )}
    </div>
  );
}
