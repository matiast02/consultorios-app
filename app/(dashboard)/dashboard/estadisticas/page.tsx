"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, CalendarCheck, TrendingUp, BarChart3, Shield } from "lucide-react";
import type { StatsData, ShiftStatus } from "@/types";
import { SHIFT_STATUS_LABELS, MONTH_NAMES } from "@/types";

const STATUS_BAR_COLORS: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-500",
  CONFIRMED: "bg-cyan-500",
  ABSENT: "bg-red-500",
  FINISHED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
};

const STATUS_LABEL_COLORS: Record<ShiftStatus, string> = {
  PENDING: "text-amber-600 dark:text-amber-400",
  CONFIRMED: "text-cyan-600 dark:text-cyan-400",
  ABSENT: "text-red-600 dark:text-red-400",
  FINISHED: "text-emerald-600 dark:text-emerald-400",
  CANCELLED: "text-slate-500 dark:text-slate-400",
};

export default function EstadisticasPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats?detailed=true");
        if (!res.ok) throw new Error("Error al cargar estadísticas");
        const json = await res.json();
        const d = json.data ?? json;
        const byStatus = d.byStatus ?? {};
        const byMonth: number[] = d.byMonth ?? Array(12).fill(0);
        setStats({
          dashboard: {
            totalPatients: d.totalPatients ?? 0,
            todayShifts: d.todayShifts ?? 0,
            pendingShifts: byStatus.PENDING ?? 0,
            finishedShifts: byStatus.FINISHED ?? 0,
            confirmedShifts: byStatus.CONFIRMED ?? 0,
            absentShifts: byStatus.ABSENT ?? 0,
            cancelledShifts: byStatus.CANCELLED ?? 0,
          },
          shiftsByStatus: Object.entries(byStatus)
            .filter(([, count]) => (count as number) > 0)
            .map(([status, count]) => ({
              status: status as ShiftStatus,
              count: count as number,
            })),
          shiftsByMonth: byMonth.map((count: number, i: number) => ({
            month: String(i + 1),
            count,
          })),
          patientsByInsurance: d.byHealthInsurance ?? [],
        });
      } catch {
        toast.error("No se pudieron cargar las estadísticas");
        setStats({
          dashboard: {
            totalPatients: 0,
            todayShifts: 0,
            pendingShifts: 0,
            finishedShifts: 0,
            confirmedShifts: 0,
            absentShifts: 0,
            cancelledShifts: 0,
          },
          shiftsByMonth: [],
          shiftsByStatus: [],
          patientsByInsurance: [],
        });
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (!stats) return null;

  const totalShiftsByStatus = stats.shiftsByStatus.reduce(
    (sum, s) => sum + s.count,
    0
  );
  const maxMonthlyCount = Math.max(
    ...stats.shiftsByMonth.map((m) => m.count),
    1
  );
  const maxInsuranceCount = Math.max(
    ...stats.patientsByInsurance.map((p) => p.count),
    1
  );

  const summaryCards = [
    {
      title: "Total Pacientes",
      value: stats.dashboard.totalPatients,
      icon: Users,
      borderColor: "border-l-primary",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: "Turnos Hoy",
      value: stats.dashboard.todayShifts,
      icon: CalendarCheck,
      borderColor: "border-l-emerald-500",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Turnos Pendientes",
      value: stats.dashboard.pendingShifts,
      icon: TrendingUp,
      borderColor: "border-l-amber-500",
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "Turnos Finalizados",
      value: stats.dashboard.finishedShifts,
      icon: CalendarCheck,
      borderColor: "border-l-cyan-500",
      iconBg: "bg-cyan-50 dark:bg-cyan-950/40",
      iconColor: "text-cyan-600 dark:text-cyan-400",
    },
  ];

  const insuranceColors = [
    "bg-primary",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-orange-500",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Estadísticas</h1>
        <p className="text-muted-foreground">
          Resumen general de la actividad del consultorio
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
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
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Shifts by Status */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base">Turnos por Estado</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {stats.shiftsByStatus.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin datos disponibles
              </p>
            ) : (
              <div className="space-y-4">
                {stats.shiftsByStatus.map((item) => {
                  const percentage =
                    totalShiftsByStatus > 0
                      ? (item.count / totalShiftsByStatus) * 100
                      : 0;
                  return (
                    <div key={item.status} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span
                          className={`font-medium ${STATUS_LABEL_COLORS[item.status]}`}
                        >
                          {SHIFT_STATUS_LABELS[item.status]}
                        </span>
                        <span className="text-muted-foreground">
                          {item.count}{" "}
                          <span className="text-xs">
                            ({percentage.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${STATUS_BAR_COLORS[item.status]}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Patients by Insurance */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base">Pacientes por Obra Social</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {stats.patientsByInsurance.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin datos disponibles
              </p>
            ) : (
              <div className="space-y-4">
                {stats.patientsByInsurance.map((item, i) => {
                  const percentage = (item.count / maxInsuranceCount) * 100;
                  return (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">
                          {item.count}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            insuranceColors[i % insuranceColors.length]
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shifts by Month — vertical bar chart */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Turnos por Mes ({new Date().getFullYear()})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {stats.shiftsByMonth.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin datos disponibles
            </p>
          ) : (
            <div className="flex items-end gap-1.5 overflow-x-auto pb-2 pt-4 sm:gap-2">
              {stats.shiftsByMonth.map((item) => {
                const heightPercent = (item.count / maxMonthlyCount) * 100;
                const monthIndex = parseInt(item.month) - 1;
                const monthName =
                  monthIndex >= 0 && monthIndex < 12
                    ? MONTH_NAMES[monthIndex].substring(0, 3)
                    : item.month;
                const isCurrentMonth =
                  monthIndex === new Date().getMonth();
                return (
                  <div
                    key={item.month}
                    className="flex min-w-[40px] flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {item.count > 0 ? item.count : ""}
                    </span>
                    <div className="w-full px-0.5">
                      <div
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          isCurrentMonth
                            ? "bg-primary"
                            : "bg-primary/40 dark:bg-primary/30"
                        }`}
                        style={{
                          height: `${Math.max(heightPercent * 1.5, item.count > 0 ? 6 : 2)}px`,
                        }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        isCurrentMonth
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {monthName}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
