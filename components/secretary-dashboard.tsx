"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CreateShiftDialog } from "@/components/shifts/create-shift-dialog";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { ShiftQuickDialogLoader } from "@/components/shifts/shift-quick-dialog-loader";

import { SecretaryDashboardHeader } from "@/components/dashboard/secretary/dashboard-header";
import { SecretaryStatsRow } from "@/components/dashboard/secretary/stats-row";
import { WaitingRoomCard } from "@/components/dashboard/secretary/waiting-room-card";
import { NextToCallCard } from "@/components/dashboard/secretary/next-to-call-card";
import { RemindersCard, formatDispatchSummary } from "@/components/dashboard/secretary/reminders-card";
import { OnlineBookingsCard } from "@/components/dashboard/secretary/online-bookings-card";
import { TodaySlotsCard } from "@/components/dashboard/secretary/today-slots-card";
import { AgendaDayCard } from "@/components/dashboard/secretary/agenda-day-card";
import { RegisterArrivalDialog } from "@/components/dashboard/secretary/register-arrival-dialog";
import { CallToRoomDialog, type CallToRoomTarget } from "@/components/waiting-room/call-to-room-dialog";
import { formatTicketNumber } from "@/lib/waiting-room/format";

import type { CalledItem, SecretaryDashboardData, WaitingRoomItem } from "@/types";

interface SecretaryDashboardProps {
  userName: string;
}

export function SecretaryDashboard({ userName }: SecretaryDashboardProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  void userId;

  const [data, setData] = useState<SecretaryDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReminders, setSendingReminders] = useState(false);

  const [registerArrivalOpen, setRegisterArrivalOpen] = useState(false);
  const [createShiftOpen, setCreateShiftOpen] = useState(false);
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  // Llamado a consultorio (módulo waiting_room): a quién y adónde.
  const [callTarget, setCallTarget] = useState<CallToRoomTarget | null>(null);
  // Walk-in al que se le está asignando un turno: se vincula al crearlo (hereda llegada y número).
  const [pendingWalkIn, setPendingWalkIn] = useState<{ id: string; patientId: string } | null>(null);

  // Pre-fill state for "crear turno a partir de un hueco"
  const [slotDefaults, setSlotDefaults] = useState<{
    medicId: string;
    date: Date;
    startTime: string;
    endTime: string;
    durationMinutes: number;
  } | null>(null);

  // Shift detail viewer — just the id; the loader fetches + mounts the dialog.
  const [detailShiftId, setDetailShiftId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/secretary");
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

  // Refresh waiting times every 30 seconds so the badges stay current.
  // Pause the polling whenever ANY dialog is open so we don't blow away the user's input.
  const anyDialogOpen =
    registerArrivalOpen ||
    createShiftOpen ||
    createPatientOpen ||
    !!callTarget ||
    !!detailShiftId;
  // Con la pestaña oculta no se pide nada (son ~8 consultas por vuelta); al volver
  // a verla se refresca en el acto.
  useEffect(() => {
    if (anyDialogOpen) return;
    const tick = () => {
      if (document.visibilityState === "visible") fetchDashboard();
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fetchDashboard, anyDialogOpen]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleNewShift = () => {
    setSlotDefaults(null);
    setCreateShiftOpen(true);
  };
  const handleRegisterArrival = () => setRegisterArrivalOpen(true);

  const handlePickSlot = (medicId: string, time: string, durationMinutes: number) => {
    const [h, m] = time.split(":").map((n) => parseInt(n, 10));
    const endTotal = h * 60 + m + durationMinutes;
    const endH = Math.floor(endTotal / 60);
    const endM = endTotal % 60;
    const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    // Use a Date pinned to local midnight today so the dialog reads the right day
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0);
    setSlotDefaults({
      medicId,
      date: today,
      startTime: time,
      endTime,
      durationMinutes,
    });
    setCreateShiftOpen(true);
  };

  const handleShiftClick = (shiftId: string) => {
    setDetailShiftId(shiftId);
  };

  const startConsultation = async (shiftId: string, room?: string | null) => {
    const res = await fetch(`/api/shifts/${shiftId}/start-consultation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(room === undefined ? {} : { room }),
    });
    if (!res.ok) throw new Error();
  };

  /**
   * Pase a consulta. Con el módulo de sala de espera activo pasa por el diálogo
   * de consultorio (el número y el consultorio salen en la pantalla); sin módulo
   * se registra directo, como siempre.
   */
  const callShift = async (target: {
    id: string;
    kind: "scheduled" | "walkin";
    patientName: string;
    ticketNumber: number | null;
    room: string | null;
  }) => {
    // For walk-ins we cannot start consultation directly without a shift, so we just toast.
    if (target.kind === "walkin") {
      toast.info("Asigná un turno al walk-in para llamarlo a consulta");
      return;
    }
    if (data?.waitingRoom.enabled) {
      setCallTarget({
        shiftId: target.id,
        patientName: target.patientName,
        ticketNumber: target.ticketNumber,
        room: target.room,
      });
      return;
    }
    try {
      await startConsultation(target.id);
      toast.success("Paciente pasó a consulta");
      fetchDashboard();
    } catch {
      toast.error("No se pudo registrar el pasaje a consulta");
    }
  };

  const handleConfirmCall = async (target: CallToRoomTarget, room: string | null) => {
    try {
      if (target.recall) {
        const res = await fetch(`/api/shifts/${target.shiftId}/recall`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room }),
        });
        if (!res.ok) throw new Error();
        toast.success(`Se volvió a llamar a ${target.patientName}`);
      } else {
        await startConsultation(target.shiftId, room);
        toast.success(
          target.ticketNumber != null
            ? `Llamado N.º ${formatTicketNumber(target.ticketNumber)}${room ? ` → ${room}` : ""}`
            : "Paciente pasó a consulta",
        );
      }
      fetchDashboard();
    } catch {
      toast.error("No se pudo registrar el llamado");
      throw new Error("call failed");
    }
  };

  const handleRecall = (item: CalledItem) => {
    setCallTarget({
      shiftId: item.shiftId,
      patientName: `${item.patient.lastName}, ${item.patient.firstName}`,
      ticketNumber: item.ticketNumber,
      room: item.room,
      recall: true,
    });
  };

  const handleMarkSeen = (item: WaitingRoomItem) =>
    callShift({
      id: item.id,
      kind: item.kind,
      patientName: `${item.patient.lastName}, ${item.patient.firstName}`,
      ticketNumber: item.ticketNumber ?? null,
      room: item.shift?.room ?? null,
    });

  const handleMarkAbsent = async (shiftId: string) => {
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ABSENT" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Paciente marcado como ausente");
      fetchDashboard();
    } catch {
      toast.error("No se pudo marcar como ausente");
    }
  };

  const handleCallWaiting = (item: WaitingRoomItem) => {
    if (item.patient.telephone) {
      window.location.href = `tel:${item.patient.telephone.replace(/\s+/g, "")}`;
    } else {
      toast.info("Sin teléfono registrado");
    }
  };

  const handleEditWaiting = (item: WaitingRoomItem) => {
    if (item.shift) {
      router.push(`/dashboard/calendario?shift=${item.shift.id}`);
    } else if (item.patient.id) {
      router.push(`/dashboard/pacientes/${item.patient.id}`);
    }
  };

  /** Walk-in → turno: abre el diálogo con el paciente preseleccionado, hoy y la hora actual. */
  const startAssignShift = (walkIn: { id: string; patientId: string | null }) => {
    if (!walkIn.patientId) {
      toast.info("Este walk-in no tiene ficha: cargá al paciente y después asignale el turno");
      return;
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), Math.ceil(now.getMinutes() / 5) * 5, 0);
    const end = new Date(start.getTime() + 30 * 60_000);
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setPendingWalkIn({ id: walkIn.id, patientId: walkIn.patientId });
    setSlotDefaults({
      medicId: "",
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0),
      startTime: hhmm(start),
      endTime: hhmm(end),
      durationMinutes: 30,
    });
    setCreateShiftOpen(true);
  };

  const handleAssignShift = (walkInId: string) => {
    const item = data?.salaDeEspera.find((w) => w.id === walkInId && w.kind === "walkin");
    startAssignShift({ id: walkInId, patientId: item?.patient.id ?? null });
  };

  /** Vincula el walk-in al turno creado: el turno hereda la llegada y el número de sala. */
  const linkWalkInToShift = async (walkInId: string, shiftId: string) => {
    try {
      const res = await fetch(`/api/walk-ins/${walkInId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedShiftId: shiftId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Turno asignado: el paciente sigue en sala con su número");
    } catch {
      toast.error("Se creó el turno pero no se pudo vincular al walk-in");
    }
  };

  const handleWalkInLeft = async (walkInId: string) => {
    try {
      const res = await fetch(`/api/walk-ins/${walkInId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markLeftNow: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Walk-in marcado como retirado");
      fetchDashboard();
    } catch {
      toast.error("No se pudo actualizar el walk-in");
    }
  };

  const handleViewPatient = (patientId: string) => {
    router.push(`/dashboard/pacientes/${patientId}`);
  };

  const handleNextToCall = async () => {
    const p = data?.proximoALlamar;
    if (!p) return;
    await callShift({
      id: p.waitingRoomId,
      kind: p.kind,
      patientName: `${p.patient.lastName}, ${p.patient.firstName}`,
      ticketNumber: p.ticketNumber ?? null,
      room: p.room ?? null,
    });
  };

  const handleSendReminders = async () => {
    setSendingReminders(true);
    try {
      const res = await fetch("/api/shifts/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (res.status === 403) throw new Error("Solo recepción o administración pueden enviar recordatorios");
        if (res.status === 503) throw new Error("Los recordatorios están desactivados en Configuración → Consultorio");
        throw new Error("No se pudieron enviar los recordatorios");
      }
      // ReminderDispatchSummary (lib/openapi/paths/reminders.ts)
      const summary = formatDispatchSummary(json.data);
      const opts = summary.description ? { description: summary.description } : undefined;
      if (summary.tone === "warning") toast.warning(summary.title, opts);
      else if (summary.tone === "info") toast.info(summary.title, opts);
      else toast.success(summary.title, opts);
      fetchDashboard();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron enviar los recordatorios");
    } finally {
      setSendingReminders(false);
    }
  };

  // Spinner solo en la carga inicial: los refrescos (polling, acciones) no desmontan
  // las cards, así no se pierde su estado local (p. ej. WhatsApp abiertos en recordatorios).
  if (loading && !data) {
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

  // Build payload for RegisterArrivalDialog from agenda data (medic short name baked-in)
  const todayShiftsForDialog = data.agenda.profesionales.flatMap((p) =>
    p.shifts.map((s) => ({
      id: s.id,
      start: s.start,
      patient: undefined as { id: string; firstName: string; lastName: string } | undefined,
      // We need the patient name from waiting room/agenda — agenda only has shortName.
      // Compose a tiny placeholder; the dialog only needs the short name for display.
      medicShortName: p.shortName,
      arrivedAt: null as string | null,
    })),
  );
  void todayShiftsForDialog;

  // We use salaDeEspera + a synthetic list: shifts that have NOT arrived yet — derived from agenda.
  // Simpler approach: send the salaDeEspera as "already arrived", so the dialog excludes them.
  // Cancelados, finalizados y ausentes no entran en la sala (la API rechaza la
  // llegada de un cancelado y el listado de sala ignora los otros dos).
  const arrivedIds = new Set(data.salaDeEspera.map((s) => s.id));
  const dialogShifts = data.agenda.profesionales.flatMap((p) =>
    p.shifts
      .filter((s) => !arrivedIds.has(s.id) && !["CANCELLED", "FINISHED", "ABSENT"].includes(s.status))
      .map((s) => {
        const split = s.patientShortName.split(",");
        const lastName = (split[0] ?? "").trim();
        const firstNameInit = (split[1] ?? "").trim().replace(/\.$/, "");
        return {
          id: s.id,
          start: s.start,
          patient: lastName ? { id: "", firstName: firstNameInit, lastName } : null,
          medicShortName: p.shortName,
          arrivedAt: null as string | null,
        };
      }),
  );

  return (
    <div className="space-y-5">
      <SecretaryDashboardHeader
        secretaryName={userName || data.header.secretaryName}
        activeProfessionalsCount={data.header.activeProfessionalsCount}
        onNewShift={handleNewShift}
        onRegisterArrival={handleRegisterArrival}
      />

      <SecretaryStatsRow stats={data.stats} />

      {/* Main grid: waiting room (wide) + right column */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <WaitingRoomCard
          items={data.salaDeEspera}
          onMarkSeen={handleMarkSeen}
          onMarkAbsent={handleMarkAbsent}
          onCall={handleCallWaiting}
          onEdit={handleEditWaiting}
          onAssignShift={handleAssignShift}
          onWalkInLeft={handleWalkInLeft}
          onViewPatient={handleViewPatient}
          onRegisterArrival={handleRegisterArrival}
          called={data.llamados}
          waitingRoomEnabled={data.waitingRoom.enabled}
          onRecall={handleRecall}
          onCalledAbsent={handleMarkAbsent}
        />

        <div className="space-y-4">
          <NextToCallCard data={data.proximoALlamar} onCall={handleNextToCall} />
          {/* Solo si el backend lo informa (módulo de reservas online activo). */}
          {data.reservasOnline && (
            <OnlineBookingsCard data={data.reservasOnline} onChanged={fetchDashboard} />
          )}
          <RemindersCard
            data={data.recordatorios}
            sending={sendingReminders}
            onSendPending={handleSendReminders}
            onEdit={() => router.push("/dashboard/calendario")}
            onChanged={fetchDashboard}
          />
          <TodaySlotsCard
            groups={data.huecosHoy}
            onViewWeek={() => router.push("/dashboard/calendario")}
            onPickSlot={handlePickSlot}
          />
        </div>
      </div>

      {/* Wide agenda */}
      <AgendaDayCard data={data.agenda} onShiftClick={handleShiftClick} />

      {/* Dialogs */}
      <RegisterArrivalDialog
        open={registerArrivalOpen}
        onOpenChange={setRegisterArrivalOpen}
        todayShifts={dialogShifts}
        onArrived={fetchDashboard}
        onAssignShift={(walkIn) => {
          setRegisterArrivalOpen(false);
          startAssignShift(walkIn);
        }}
      />

      <CallToRoomDialog
        target={callTarget}
        onOpenChange={(open) => {
          if (!open) setCallTarget(null);
        }}
        onConfirm={handleConfirmCall}
      />

      {createShiftOpen && (
        <CreateShiftDialog
          open={createShiftOpen}
          onOpenChange={(open) => {
            setCreateShiftOpen(open);
            if (!open) {
              setSlotDefaults(null);
              setPendingWalkIn(null);
            }
          }}
          defaultDate={slotDefaults?.date}
          defaultStartTime={slotDefaults?.startTime}
          defaultEndTime={slotDefaults?.endTime}
          defaultMedicId={slotDefaults?.medicId}
          defaultDurationMinutes={slotDefaults?.durationMinutes}
          lockMedic={!!slotDefaults?.medicId}
          defaultPatientId={pendingWalkIn?.patientId}
          onCreated={async (shift) => {
            setCreateShiftOpen(false);
            setSlotDefaults(null);
            if (pendingWalkIn && shift) await linkWalkInToShift(pendingWalkIn.id, shift.id);
            setPendingWalkIn(null);
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
          router.push(`/dashboard/calendario?shift=${s.id}`);
        }}
        onViewPatient={handleViewPatient}
      />

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
    </div>
  );
}
