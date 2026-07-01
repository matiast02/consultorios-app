"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CreateShiftDialog } from "@/components/shifts/create-shift-dialog";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { ShiftQuickDialogLoader } from "@/components/dashboard/secretary/shift-quick-dialog-loader";

import { SecretaryDashboardHeader } from "@/components/dashboard/secretary/dashboard-header";
import { SecretaryStatsRow } from "@/components/dashboard/secretary/stats-row";
import { WaitingRoomCard } from "@/components/dashboard/secretary/waiting-room-card";
import { NextToCallCard } from "@/components/dashboard/secretary/next-to-call-card";
import { RemindersCard } from "@/components/dashboard/secretary/reminders-card";
import { TodaySlotsCard } from "@/components/dashboard/secretary/today-slots-card";
import { AgendaDayCard } from "@/components/dashboard/secretary/agenda-day-card";
import { RegisterArrivalDialog } from "@/components/dashboard/secretary/register-arrival-dialog";

import type { SecretaryDashboardData, WaitingRoomItem } from "@/types";

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
    !!detailShiftId;
  useEffect(() => {
    if (anyDialogOpen) return;
    const id = setInterval(() => {
      fetchDashboard();
    }, 30_000);
    return () => clearInterval(id);
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

  const callShift = async (id: string, kind: "scheduled" | "walkin") => {
    // For walk-ins we cannot start consultation directly without a shift, so we just toast.
    if (kind === "walkin") {
      toast.info("Asigná un turno al walk-in para llamarlo a consulta");
      return;
    }
    try {
      const res = await fetch(`/api/shifts/${id}/start-consultation`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Paciente pasó a consulta");
      fetchDashboard();
    } catch {
      toast.error("No se pudo registrar el pasaje a consulta");
    }
  };

  const handleMarkSeen = (shiftId: string) => callShift(shiftId, "scheduled");

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

  const handleAssignShift = (walkInId: string) => {
    void walkInId;
    setCreateShiftOpen(true);
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
    if (!data?.proximoALlamar) return;
    await callShift(data.proximoALlamar.waitingRoomId, data.proximoALlamar.kind);
  };

  const handleSendReminders = async () => {
    setSendingReminders(true);
    try {
      const res = await fetch("/api/shifts/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      toast.success(`${json.data?.sent ?? 0} recordatorios enviados`);
      fetchDashboard();
    } catch {
      toast.error("No se pudieron enviar los recordatorios");
    } finally {
      setSendingReminders(false);
    }
  };

  if (loading) {
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
  const arrivedIds = new Set(data.salaDeEspera.map((s) => s.id));
  const dialogShifts = data.agenda.profesionales.flatMap((p) =>
    p.shifts
      .filter((s) => !arrivedIds.has(s.id))
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
        />

        <div className="space-y-4">
          <NextToCallCard data={data.proximoALlamar} onCall={handleNextToCall} />
          <RemindersCard
            data={data.recordatorios}
            sending={sendingReminders}
            onSendPending={handleSendReminders}
            onEdit={() => router.push("/dashboard/calendario")}
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
      />

      {createShiftOpen && (
        <CreateShiftDialog
          open={createShiftOpen}
          onOpenChange={(open) => {
            setCreateShiftOpen(open);
            if (!open) setSlotDefaults(null);
          }}
          defaultDate={slotDefaults?.date}
          defaultStartTime={slotDefaults?.startTime}
          defaultEndTime={slotDefaults?.endTime}
          defaultMedicId={slotDefaults?.medicId}
          defaultDurationMinutes={slotDefaults?.durationMinutes}
          lockMedic={!!slotDefaults?.medicId}
          onCreated={() => {
            setCreateShiftOpen(false);
            setSlotDefaults(null);
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
