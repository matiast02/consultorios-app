"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  CalendarCheck,
  Clock,
  CheckCircle,
  Loader2,
  Plus,
  UserPlus,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import type { DashboardStats } from "@/types";

interface DashboardContentProps {
  userName: string;
}

export function DashboardContent({ userName }: DashboardContentProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Error al cargar estadísticas");
        const json = await res.json();
        const d = json.data ?? json;
        const byStatus = d.byStatus ?? {};
        setStats({
          totalPatients: d.totalPatients ?? 0,
          todayShifts: d.todayShifts ?? 0,
          pendingShifts: byStatus.PENDING ?? 0,
          finishedShifts: byStatus.FINISHED ?? 0,
          confirmedShifts: byStatus.CONFIRMED ?? 0,
          absentShifts: byStatus.ABSENT ?? 0,
          cancelledShifts: byStatus.CANCELLED ?? 0,
        });
      } catch {
        toast.error("No se pudieron cargar las estadísticas");
        setStats({
          totalPatients: 0,
          todayShifts: 0,
          pendingShifts: 0,
          finishedShifts: 0,
          confirmedShifts: 0,
          absentShifts: 0,
          cancelledShifts: 0,
        });
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const statCards = [
    {
      title: "Total Pacientes",
      value: stats?.totalPatients ?? 0,
      icon: Users,
      description: "Pacientes registrados",
      borderColor: "border-l-primary",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: "Turnos Hoy",
      value: stats?.todayShifts ?? 0,
      icon: CalendarCheck,
      description: "Citas programadas para hoy",
      borderColor: "border-l-emerald-500",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Turnos Pendientes",
      value: stats?.pendingShifts ?? 0,
      icon: Clock,
      description: "Esperando confirmación",
      borderColor: "border-l-amber-500",
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "Turnos Finalizados",
      value: stats?.finishedShifts ?? 0,
      icon: CheckCircle,
      description: "Completados exitosamente",
      borderColor: "border-l-green-500",
      iconBg: "bg-green-50 dark:bg-green-950/40",
      iconColor: "text-green-600 dark:text-green-400",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-primary/5 to-transparent"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Stethoscope className="h-5 w-5" />
              <span className="text-sm font-medium">Panel de Control</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Bienvenido/a, {userName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Aquí tenés un resumen de la actividad del consultorio
            </p>
          </div>
          {/* Quick actions */}
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

      {/* Stat Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <Card
              key={card.title}
              className={`border-l-4 ${card.borderColor} shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-5">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.iconBg}`}
                >
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
              </CardHeader>
              <CardContent className="pb-5">
                <div className="text-3xl font-bold">{card.value}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Status breakdown */}
      {stats && !loading && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <CalendarCheck className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base">Resumen de Turnos</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  label: "Pendientes",
                  value: stats.pendingShifts,
                  dot: "bg-amber-500",
                  text: "text-amber-600 dark:text-amber-400",
                },
                {
                  label: "Confirmados",
                  value: stats.confirmedShifts,
                  dot: "bg-primary",
                  text: "text-primary",
                },
                {
                  label: "Finalizados",
                  value: stats.finishedShifts,
                  dot: "bg-emerald-500",
                  text: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  label: "Ausentes",
                  value: stats.absentShifts,
                  dot: "bg-red-500",
                  text: "text-red-600 dark:text-red-400",
                },
                {
                  label: "Cancelados",
                  value: stats.cancelledShifts,
                  dot: "bg-muted-foreground/40",
                  text: "text-muted-foreground",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"
                >
                  <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
                  <div>
                    <p className={`text-lg font-bold leading-none ${item.text}`}>
                      {item.value}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
