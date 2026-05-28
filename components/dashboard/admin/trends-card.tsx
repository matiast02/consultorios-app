"use client";

import { useMemo } from "react";
import { BarChart3, TrendingUp } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AdminTrends,
  TrendMonthPoint,
  TrendTopInsurance,
  TrendTopSpecialty,
  TrendWeekPoint,
} from "@/types";

interface TrendsCardProps {
  trends: AdminTrends;
}

// ─── Bars helpers ────────────────────────────────────────────────────────────

function maxOf(values: number[]): number {
  let m = 0;
  for (const v of values) if (v > m) m = v;
  return m;
}

// ─── Sub-views ───────────────────────────────────────────────────────────────

function WeekBars({ data }: { data: TrendWeekPoint[] }) {
  const max = useMemo(() => maxOf(data.map((d) => d.count)), [data]);
  const total = useMemo(() => data.reduce((acc, d) => acc + d.count, 0), [data]);
  const avg = data.length > 0 ? total / data.length : 0;

  if (data.length === 0) {
    return <EmptyState message="No hay datos para mostrar." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-44 items-end justify-between gap-2 rounded-xl bg-muted/30 px-3 py-3">
        {data.map((d) => {
          const heightPct = max > 0 ? Math.max(2, (d.count / max) * 100) : 2;
          return (
            <div
              key={d.weekStart}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              title={`${d.label}: ${d.count} turnos`}
            >
              <span className="text-[10px] font-semibold tabular-nums text-muted-foreground opacity-0 transition group-hover:opacity-100">
                {d.count}
              </span>
              <div
                className="w-full rounded-md bg-emerald-500/80 transition group-hover:bg-emerald-600"
                style={{ height: `${heightPct}%` }}
              />
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          Total: <span className="font-semibold tabular-nums text-foreground">{total}</span>
        </span>
        <span>
          Promedio: <span className="font-semibold tabular-nums text-foreground">{avg.toFixed(1)}</span>{" "}
          /sem
        </span>
      </div>
    </div>
  );
}

function MonthStackedBars({ data }: { data: TrendMonthPoint[] }) {
  const max = useMemo(() => maxOf(data.map((d) => d.total)), [data]);

  if (data.length === 0) {
    return <EmptyState message="No hay datos para mostrar." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-44 items-end justify-between gap-2 rounded-xl bg-muted/30 px-3 py-3">
        {data.map((d) => {
          const totalHeightPct = max > 0 ? Math.max(2, (d.total / max) * 100) : 2;
          const cancelledPct = d.total > 0 ? (d.cancelled / d.total) * 100 : 0;
          const absentPct = d.total > 0 ? (d.absent / d.total) * 100 : 0;
          return (
            <div
              key={d.month}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              title={`${d.label}: cancelados ${d.cancelled}, ausentes ${d.absent}, total ${d.total}`}
            >
              <span className="text-[10px] font-semibold tabular-nums text-rose-600">
                {d.noShowPct.toFixed(1)}%
              </span>
              <div
                className="flex w-full flex-col overflow-hidden rounded-md"
                style={{ height: `${totalHeightPct}%` }}
              >
                <div
                  className="bg-rose-500/80"
                  style={{ height: `${absentPct}%` }}
                  aria-label="ausentes"
                />
                <div
                  className="bg-slate-400/80"
                  style={{ height: `${cancelledPct}%` }}
                  aria-label="cancelados"
                />
                <div
                  className="bg-emerald-200/60 dark:bg-emerald-900/40"
                  style={{ height: `${Math.max(0, 100 - absentPct - cancelledPct)}%` }}
                  aria-label="resto"
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-rose-500/80" />
          Ausentes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-slate-400/80" />
          Cancelados
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-200/60 dark:bg-emerald-900/40" />
          Asistidos
        </span>
      </div>
    </div>
  );
}

function TopList({
  items,
  showColor,
  emptyMessage,
}: {
  items: Array<{ id: string | null; name: string; color?: string | null; count: number }>;
  showColor: boolean;
  emptyMessage: string;
}) {
  const max = useMemo(() => maxOf(items.map((d) => d.count)), [items]);

  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((it, idx) => {
        const pct = max > 0 ? (it.count / max) * 100 : 0;
        return (
          <li key={it.id ?? `${it.name}-${idx}`} className="flex items-center gap-3">
            {showColor && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: it.color ?? "#94a3b8" }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium text-foreground">
                  {it.name}
                </span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground/80">
                  {it.count}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#0d4f4d] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <BarChart3 className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function TrendsCard({ trends }: TrendsCardProps) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Tendencias
        </div>
      </div>

      <div className="px-5 py-4">
        <Tabs defaultValue="week" className="flex w-full flex-col gap-4">
          <TabsList variant="line" className="flex flex-wrap">
            <TabsTrigger value="week">Turnos por semana</TabsTrigger>
            <TabsTrigger value="month">Cancelaciones por mes</TabsTrigger>
            <TabsTrigger value="specialties">Top especialidades</TabsTrigger>
            <TabsTrigger value="insurances">Top obras sociales</TabsTrigger>
          </TabsList>

          <TabsContent value="week" className="pt-2">
            <WeekBars data={trends.shiftsByWeek ?? []} />
          </TabsContent>

          <TabsContent value="month" className="pt-2">
            <MonthStackedBars data={trends.cancellationByMonth ?? []} />
          </TabsContent>

          <TabsContent value="specialties" className="pt-2">
            <TopList
              items={(trends.topSpecialties ?? []) as TrendTopSpecialty[]}
              showColor
              emptyMessage="Sin especialidades con turnos."
            />
          </TabsContent>

          <TabsContent value="insurances" className="pt-2">
            <TopList
              items={(trends.topHealthInsurances ?? []) as TrendTopInsurance[]}
              showColor={false}
              emptyMessage="Sin obras sociales con turnos."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
