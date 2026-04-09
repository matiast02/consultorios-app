"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Clock,
  CheckCircle,
  UserX,
  CalendarCheck,
  Loader2,
  Plus,
  UserPlus,
  Stethoscope,
  ChevronRight,
  Users,
} from "lucide-react";
import type { Shift, Medic } from "@/types";
import { SHIFT_STATUS_LABELS, SHIFT_STATUS_COLORS } from "@/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface SecretaryDashboardProps {
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

export function SecretaryDashboard({ userName }: SecretaryDashboardProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [medics, setMedics] = useState<Medic[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        month: String(today.getMonth() + 1),
        year: String(today.getFullYear()),
      });
      const [shiftsRes, medicsRes] = await Promise.all([
        fetch(`/api/shifts?${params}`),
        fetch("/api/users/medics"),
      ]);

      if (shiftsRes.ok) {
        const json = await shiftsRes.json();
        setShifts(json.data ?? []);
      }
      if (medicsRes.ok) {
        const json = await medicsRes.json();
        setMedics(json.data ?? []);
      }
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const todayShifts = shifts
    .filter((s) => isSameDay(new Date(s.start), today))
    .sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

  // Stats per medic
  const medicStats = medics.map((medic) => {
    const medicShifts = todayShifts.filter((s) => s.userId === medic.id);
    return {
      medic,
      total: medicShifts.length,
      pending: medicShifts.filter(
        (s) => s.status === "PENDING" || s.status === "CONFIRMED"
      ).length,
      finished: medicShifts.filter((s) => s.status === "FINISHED").length,
      absent: medicShifts.filter((s) => s.status === "ABSENT").length,
    };
  });

  // Global stats
  const totalToday = todayShifts.length;
  const totalPending = todayShifts.filter(
    (s) => s.status === "PENDING" || s.status === "CONFIRMED"
  ).length;
  const totalFinished = todayShifts.filter(
    (s) => s.status === "FINISHED"
  ).length;
  const totalAbsent = todayShifts.filter(
    (s) => s.status === "ABSENT"
  ).length;

  // Upcoming shifts (next ones that are pending/confirmed)
  const upcomingShifts = todayShifts
    .filter((s) => s.status === "PENDING" || s.status === "CONFIRMED")
    .slice(0, 8);

  const medicName = (shift: Shift) => {
    if (!shift.user) return "—";
    return shift.user.lastName
      ? `Dr. ${shift.user.lastName}`
      : shift.user.name ?? "Medico";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-primary/5 to-transparent"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <ClipboardList className="h-5 w-5" />
              <span className="text-sm font-medium">
                Recepcion y Agenda
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {userName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {format(today, "EEEE, d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/pacientes">
                <UserPlus className="mr-2 h-4 w-4" />
                Nuevo Paciente
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/calendario">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Turno
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </div>
      ) : (
        <>
          {/* Global stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
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
                value: totalPending,
                icon: Clock,
                color: "text-amber-600 dark:text-amber-400",
                bg: "bg-amber-50 dark:bg-amber-950/40",
                border: "border-l-amber-500",
              },
              {
                label: "Atendidos",
                value: totalFinished,
                icon: CheckCircle,
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
                border: "border-l-emerald-500",
              },
              {
                label: "Ausentes",
                value: totalAbsent,
                icon: UserX,
                color: "text-red-600 dark:text-red-400",
                bg: "bg-red-50 dark:bg-red-950/40",
                border: "border-l-red-500",
              },
            ].map((card) => (
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

          {/* Medic cards */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Stethoscope className="h-5 w-5 text-primary" />
              Agenda por Medico
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {medicStats.map(({ medic, total, pending, finished, absent }) => (
                <Link
                  key={medic.id}
                  href={`/dashboard/calendario?medico=${medic.id}`}
                >
                  <Card className="cursor-pointer shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {(medic.lastName ?? medic.name ?? "M")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">
                              {medic.lastName
                                ? `Dr. ${medic.lastName}`
                                : medic.name ?? "Medico"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {medic.specialization?.name ?? "Sin especialidad"}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>

                      <div className="mt-3 flex items-center gap-3 text-xs">
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                          {total} turnos
                        </span>
                        {pending > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {pending} pend.
                          </span>
                        )}
                        {finished > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {finished} atend.
                          </span>
                        )}
                        {absent > 0 && (
                          <span className="text-red-600 dark:text-red-400">
                            {absent} aus.
                          </span>
                        )}
                        {total === 0 && (
                          <span className="text-muted-foreground">
                            Sin turnos hoy
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming shifts */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base">
                    Proximos turnos de hoy
                  </CardTitle>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/calendario">
                    Ver agenda completa
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingShifts.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay turnos pendientes para hoy.
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm font-medium">
                          {formatTime(new Date(shift.start))}
                        </span>
                        <div>
                          <p className="text-sm font-medium">
                            {shift.patient
                              ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                              : "Paciente"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {medicName(shift)}
                            {shift.patient?.os &&
                              ` — ${shift.patient.os.name}`}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${SHIFT_STATUS_COLORS[shift.status]}`}
                      >
                        {SHIFT_STATUS_LABELS[shift.status]}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
