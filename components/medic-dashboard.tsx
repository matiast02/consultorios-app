"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { ScheduleSetupWizard } from "@/components/schedule-setup-wizard";
import { QuickAttendDialog } from "@/components/shifts/quick-attend-dialog";
import { CreateShiftDialog } from "@/components/shifts/create-shift-dialog";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { RescheduledBanner } from "@/components/dashboard/rescheduled-banner";
import { ShiftQuickDialogLoader } from "@/components/shifts/shift-quick-dialog-loader";
import { CallToRoomDialog, type CallToRoomTarget } from "@/components/waiting-room/call-to-room-dialog";
import { formatTicketNumber } from "@/lib/waiting-room/format";

import { DashboardHeader } from "@/components/dashboard/medic/dashboard-header";
import { NextShiftCard } from "@/components/dashboard/medic/next-shift-card";
import { DaySummaryCard } from "@/components/dashboard/medic/day-summary-card";
import { TodayShiftsCard } from "@/components/dashboard/medic/today-shifts-card";
import { WeekCard } from "@/components/dashboard/medic/week-card";
import { PendientesCard } from "@/components/dashboard/medic/pendientes-card";
import { QuickActionsCard } from "@/components/dashboard/medic/quick-actions-card";
import { RecentPatientsCard } from "@/components/dashboard/medic/recent-patients-card";

import type { DashboardShift, MedicDashboardData, Shift } from "@/types";

interface MedicDashboardProps {
  userName: string;
}

function toShift(d: DashboardShift): Shift {
  return {
    id: d.id,
    userId: "",
    patientId: d.patient?.id ?? "",
    start: d.start,
    end: d.end,
    observations: d.observations ?? null,
    status: d.status,
    isOverbook: d.isOverbook,
    consultationTypeId: d.consultationType?.id ?? null,
    consultationType: d.consultationType
      ? { id: d.consultationType.id, name: d.consultationType.name, color: d.consultationType.color ?? null, durationMinutes: d.durationMinutes, isDefault: false }
      : null,
    patient: d.patient
      ? {
          id: d.patient.id,
          firstName: d.patient.firstName,
          lastName: d.patient.lastName,
          telephone: d.patient.telephone ?? null,
          osId: d.patient.os?.id ?? null,
          os: d.patient.os ?? null,
          createdAt: "",
          updatedAt: "",
        }
      : undefined,
    createdAt: "",
    updatedAt: "",
  };
}

export function MedicDashboard({ userName }: MedicDashboardProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const [data, setData] = useState<MedicDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsScheduleSetup, setNeedsScheduleSetup] = useState(false);
  const [checkingSchedule, setCheckingSchedule] = useState(true);
  const [rescheduledShifts, setRescheduledShifts] = useState<Shift[]>([]);
  const [dismissedRescheduled, setDismissedRescheduled] = useState(false);

  const [attendShift, setAttendShift] = useState<Shift | null>(null);
  const [detailShiftId, setDetailShiftId] = useState<string | null>(null);
  const [createShiftOpen, setCreateShiftOpen] = useState(false);
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  // Llamado a consultorio (módulo waiting_room); el paciente del llamado para abrir su ficha al confirmar.
  const [callTarget, setCallTarget] = useState<CallToRoomTarget | null>(null);
  const callPatientRef = useRef<string | null>(null);

  // Schedule check
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
        // non-critical
      } finally {
        setCheckingSchedule(false);
      }
    }
    checkSchedule();
  }, [userId]);

  // Rescheduled banner
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/shifts/rescheduled");
        if (res.ok) {
          const json = await res.json();
          setRescheduledShifts(json.data ?? []);
        }
      } catch {
        // non-critical
      }
    }
    load();
  }, []);

  // Main dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/medic");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data ?? null);
    } catch {
      toast.error("No se pudo cargar el dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Refresco real cada 60 s (llegadas y llamados que registra recepción), pausado con
  // la pestaña oculta o con un diálogo abierto. Antes solo se forzaba un re-render de
  // todas las cards para mover el contador, que ahora avanza solo en NextShiftCard.
  const anyDialogOpen =
    !!attendShift || createShiftOpen || createPatientOpen || !!callTarget || !!detailShiftId;
  useEffect(() => {
    if (anyDialogOpen) return;
    const tick = () => {
      if (document.visibilityState === "visible") fetchDashboard();
    };
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fetchDashboard, anyDialogOpen]);

  // ─── Action handlers ───
  const openNewShift = () => setCreateShiftOpen(true);
  const openNewPatient = () => setCreatePatientOpen(true);
  const openSearchPatient = () => router.push("/dashboard/pacientes");
  const openBlockDay = () => router.push("/dashboard/configuracion?tab=bloqueados");
  const goToPatient = (patientId: string) => router.push(`/dashboard/pacientes/${patientId}`);
  /** Ficha del paciente en modo consulta (barra «Consulta en curso» sobre ese turno). */
  const goToConsultation = (patientId: string, shiftId: string) =>
    router.push(`/dashboard/pacientes/${patientId}?turno=${shiftId}`);

  const patientName = (s: { patient?: { firstName: string; lastName: string } | null }) =>
    s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : "Paciente";

  /** Lo mínimo de un turno para iniciar la consulta (fila del dashboard o ficha rápida). */
  type StartableShift = {
    id: string;
    patient?: { id: string; firstName: string; lastName: string } | null;
    arrivedAt?: string | null;
    consultationStartedAt?: string | null;
    ticketNumber?: number | null;
  };

  /**
   * Atender = ir a la ficha en modo consulta. Si ya está en consulta, directo.
   * Con el módulo de sala pasa por el diálogo de consultorio (llamado) y navega
   * al confirmar; sin módulo registra el pase a consulta y abre la ficha.
   */
  const handleStartConsultation = async (s: StartableShift) => {
    const patientId = s.patient?.id;
    if (!patientId) return;
    if (s.consultationStartedAt) {
      goToConsultation(patientId, s.id);
      return;
    }
    if (data?.waitingRoom.enabled) {
      callPatientRef.current = patientId;
      setCallTarget({
        shiftId: s.id,
        patientName: patientName(s),
        ticketNumber: s.ticketNumber ?? null,
        room: data.waitingRoom.room ?? null,
      });
      return;
    }
    try {
      const res = await fetch(`/api/shifts/${s.id}/start-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error();
      goToConsultation(patientId, s.id);
    } catch {
      toast.error("No se pudo iniciar la consulta");
    }
  };
  /** Cierre rápido sin pasar por la ficha (p. ej. consulta telefónica). */
  const handleAttend = (s: DashboardShift) => {
    setAttendShift(toShift(s));
  };
  const handleEditObs = (s: DashboardShift) => {
    // For now we redirect to calendar so the user can edit there.
    // A future iteration could open an inline editor here.
    router.push(`/dashboard/calendario?shift=${s.id}`);
  };

  // ─── Sala de espera: llamar desde «Turnos de hoy» (mismo camino que atender) ───
  const handleCall = (s: DashboardShift) => {
    void handleStartConsultation(s);
  };

  const handleConfirmCall = async (target: CallToRoomTarget, room: string | null) => {
    try {
      const res = await fetch(`/api/shifts/${target.shiftId}/start-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        target.ticketNumber != null
          ? `Llamado N.º ${formatTicketNumber(target.ticketNumber)}${room ? ` → ${room}` : ""}`
          : "Paciente pasó a consulta",
      );
      // Llamado hecho: seguir en la ficha del paciente, donde se atiende.
      const patientId =
        callPatientRef.current ?? data?.today.shifts.find((x) => x.id === target.shiftId)?.patient?.id ?? null;
      callPatientRef.current = null;
      if (patientId) goToConsultation(patientId, target.shiftId);
      else fetchDashboard();
    } catch {
      toast.error("No se pudo registrar el llamado");
      throw new Error("call failed");
    }
  };

  /** Repite el aviso en la pantalla con el mismo consultorio. */
  const handleRecall = async (s: DashboardShift) => {
    try {
      const res = await fetch(`/api/shifts/${s.id}/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error();
      toast.success(`Se volvió a llamar a ${patientName(s)}`);
      fetchDashboard();
    } catch {
      toast.error("No se pudo volver a llamar");
    }
  };

  // Spinner de página solo en la primera carga; los refrescos no tapan el panel.
  if (checkingSchedule || (loading && !data)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        No se pudo cargar el dashboard. Intentá recargar la página.
      </div>
    );
  }

  const doctorName = (() => {
    // Show "Dr. Apellido" if userName looks like "Nombre Apellido"
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `Dr. ${parts[parts.length - 1]}`;
    }
    return userName;
  })();

  return (
    <div className="space-y-5">
      {userId && (
        <ScheduleSetupWizard
          open={needsScheduleSetup}
          userId={userId}
          userName={userName}
          mandatory
          onComplete={() => setNeedsScheduleSetup(false)}
        />
      )}

      <DashboardHeader
        doctorName={doctorName}
        onNewShift={openNewShift}
        onNewPatient={openNewPatient}
      />

      {!dismissedRescheduled && rescheduledShifts.length > 0 && (
        <RescheduledBanner
          shifts={rescheduledShifts}
          maxVisible={3}
          onDismiss={() => setDismissedRescheduled(true)}
        />
      )}

      {/* Top row: próximo turno + resumen del día */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <NextShiftCard
          shift={data.today.nextShift}
          onStartConsultation={(s) => void handleStartConsultation(s)}
          onViewPatient={goToPatient}
          waitingRoomEnabled={data.waitingRoom.enabled}
        />
        <DaySummaryCard stats={data.today.stats} />
      </div>

      {/* Main row: turnos de hoy + sidebar */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <TodayShiftsCard
          shifts={data.today.shifts}
          nextShiftId={data.today.nextShift?.id ?? null}
          onAttend={handleAttend}
          onViewPatient={goToPatient}
          onEditObs={handleEditObs}
          onSelectShift={(s) => setDetailShiftId(s.id)}
          waitingRoomEnabled={data.waitingRoom.enabled}
          onCall={handleCall}
          onRecall={handleRecall}
          onStart={(s) => void handleStartConsultation(s)}
          onContinue={(s) => s.patient && goToConsultation(s.patient.id, s.id)}
        />

        <CallToRoomDialog
          target={callTarget}
          onOpenChange={(open) => {
            if (!open) setCallTarget(null);
          }}
          onConfirm={handleConfirmCall}
        />

        <div className="space-y-4">
          <WeekCard data={data.week} />
          <PendientesCard data={data.pendientes} />
          <QuickActionsCard
            onNewShift={openNewShift}
            onNewPatient={openNewPatient}
            onBlockDay={openBlockDay}
            onSearchPatient={openSearchPatient}
          />
          <RecentPatientsCard patients={data.recentPatients} />
        </div>
      </div>

      {/* Dialogs */}
      {attendShift && (
        <QuickAttendDialog
          open={!!attendShift}
          onOpenChange={(open) => {
            if (!open) {
              setAttendShift(null);
              fetchDashboard();
            }
          }}
          shift={attendShift}
          onSaved={() => {}} // onOpenChange ya refresca al cerrar; antes se pedía dos veces
          onScheduleNext={() => {
            setAttendShift(null);
          }}
          onScheduleRecurring={() => {
            setAttendShift(null);
          }}
          onCreateStudyOrder={() => {
            setAttendShift(null);
          }}
        />
      )}

      {createShiftOpen && (
        <CreateShiftDialog
          open={createShiftOpen}
          onOpenChange={setCreateShiftOpen}
          defaultMedicId={userId}
          lockMedic
          onCreated={() => {
            setCreateShiftOpen(false);
            fetchDashboard();
          }}
        />
      )}

      {createPatientOpen && (
        <PatientFormDialog
          open={createPatientOpen}
          onOpenChange={setCreatePatientOpen}
          onSaved={() => {
            setCreatePatientOpen(false);
            fetchDashboard();
          }}
        />
      )}

      <ShiftQuickDialogLoader
        shiftId={detailShiftId}
        onOpenChange={(open) => {
          if (!open) setDetailShiftId(null);
        }}
        onUpdated={() => {
          fetchDashboard();
        }}
        onReschedule={(s) => {
          setDetailShiftId(null);
          router.push(`/dashboard/calendario?shift=${s.id}`);
        }}
        onViewPatient={(patientId) => {
          setDetailShiftId(null);
          goToPatient(patientId);
        }}
        primaryAction={{
          label: "Atender",
          onClick: (s) => {
            setDetailShiftId(null);
            void handleStartConsultation({
              id: s.id,
              patient: s.patient
                ? { id: s.patient.id, firstName: s.patient.firstName, lastName: s.patient.lastName }
                : null,
              arrivedAt: s.arrivedAt,
              consultationStartedAt: s.consultationStartedAt,
              ticketNumber: s.ticket?.number ?? null,
            });
          },
          disabled: false,
        }}
      />
    </div>
  );
}
