"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { format, isSameDay, startOfDay, isBefore, differenceInDays, addDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarX,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  BLOCK_DAY_CATEGORY_LABELS,
  type BlockDay,
  type BlockDayCategory,
} from "@/types";
import { cn } from "@/lib/utils";
import {
  BlockDaysDialog,
  RescheduledShiftsDialog,
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_TILE,
  type RescheduledShift,
} from "@/components/configuracion/block-days-dialog";

// Filter-pill dot colors (match the design's per-category palette):
//   VACATION = info-blue, HOLIDAY = violet, CONFERENCE = warning-amber, OTHER = muted-gray
const CATEGORY_DOT: Record<BlockDayCategory, string> = {
  VACATION: "bg-[#1d6db5]",
  HOLIDAY: "bg-[#7b3fb6]",
  CONFERENCE: "bg-[#b46a13]",
  OTHER: "bg-slate-400",
};

// Group consecutive dates with the same category and note into ranges
type Range = {
  ids: string[];
  from: Date;
  to: Date;
  category: BlockDayCategory;
  note: string | null;
};

function groupIntoRanges(days: BlockDay[]): Range[] {
  const sorted = [...days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const ranges: Range[] = [];
  for (const day of sorted) {
    const date = startOfDay(new Date(day.date));
    const last = ranges[ranges.length - 1];
    const sameNote = (last?.note ?? null) === (day.note ?? null);
    if (
      last &&
      last.category === day.category &&
      sameNote &&
      differenceInDays(date, last.to) === 1
    ) {
      last.to = date;
      last.ids.push(day.id);
    } else {
      ranges.push({ ids: [day.id], from: date, to: date, category: day.category, note: day.note ?? null });
    }
  }
  return ranges;
}

function rangeTitle(r: Range): string {
  if (r.note) return r.note;
  return BLOCK_DAY_CATEGORY_LABELS[r.category];
}

function rangeDateLabel(r: Range): string {
  const fromFmt = format(r.from, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
  if (isSameDay(r.from, r.to)) return `${fromFmt} · 1 día`;
  const toFmt = format(r.to, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
  const days = differenceInDays(r.to, r.from) + 1;
  return `${fromFmt} → ${toFmt} · ${days} días`;
}

// ─── Mini calendar component ────────────────────────────────────────────────
function MiniCalendar({
  month,
  setMonth,
  selectedRange,
  onPickDate,
  blockedDayKeys,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  selectedRange: { from: Date | null; to: Date | null };
  onPickDate: (d: Date) => void;
  blockedDayKeys: Set<string>;
}) {
  const today = startOfDay(new Date());
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstOfMonth = new Date(year, monthIdx, 1);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  // Monday=0 grid
  const firstDow = (firstOfMonth.getDay() + 6) % 7;
  const cells: ({ date: Date; inMonth: boolean })[] = [];
  // Leading: empty placeholders for previous month
  for (let i = firstDow; i > 0; i--) {
    cells.push({ date: new Date(year, monthIdx, 1 - i), inMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, monthIdx, d), inMonth: true });
  }
  // Pad trailing so the grid is full rows (but cells stay invisible)
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: addDays(last, 1), inMonth: false });
  }

  function isInSelectedRange(d: Date): boolean {
    if (!selectedRange.from) return false;
    const t = startOfDay(d).getTime();
    const a = startOfDay(selectedRange.from).getTime();
    const b = selectedRange.to ? startOfDay(selectedRange.to).getTime() : a;
    return t >= Math.min(a, b) && t <= Math.max(a, b);
  }

  function key(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  return (
    <div className="w-full max-w-[420px] rounded-xl border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold capitalize">
          {format(month, "MMMM yyyy", { locale: es })}
        </h4>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth(new Date(year, monthIdx - 1, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth(new Date(year, monthIdx + 1, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map(({ date, inMonth }, i) => {
          // Empty placeholder cell (previous/next month)
          if (!inMonth) {
            return <div key={i} className="aspect-square" />;
          }

          const isToday = isSameDay(date, today);
          const isPast = isBefore(date, today) && !isToday;
          const inRange = isInSelectedRange(date);
          const isRangeStart = selectedRange.from && isSameDay(date, selectedRange.from);
          const isRangeEnd = selectedRange.to && isSameDay(date, selectedRange.to);
          const blocked = blockedDayKeys.has(key(date));

          // State precedence: range > today > blocked > default
          let stateClass = "";
          if (isRangeStart || isRangeEnd || (inRange && selectedRange.to)) {
            stateClass = "bg-primary text-primary-foreground font-semibold";
          } else if (isToday) {
            stateClass = "bg-primary text-primary-foreground font-semibold";
          } else if (blocked) {
            stateClass = "bg-[#fbe7e3] text-[#8e2a1d] font-semibold dark:bg-rose-950/40 dark:text-rose-200";
          } else {
            stateClass = "bg-muted/40 text-foreground hover:bg-primary/10";
          }

          return (
            <button
              key={i}
              type="button"
              disabled={isPast}
              onClick={() => onPickDate(date)}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-md text-sm transition-colors",
                stateClass,
                isPast && "cursor-not-allowed opacity-40"
              )}
            >
              <span className="leading-none">{date.getDate()}</span>
              {blocked && !isToday && !inRange && (
                <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[#c0392b]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BlockedDaysTab() {
  const { data: session } = useSession();
  const userId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [blockDays, setBlockDays] = useState<BlockDay[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [pickFrom, setPickFrom] = useState<Date | null>(null);
  const [pickTo, setPickTo] = useState<Date | null>(null);
  const [filter, setFilter] = useState<BlockDayCategory | "ALL">("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const [rescheduled, setRescheduled] = useState<RescheduledShift[]>([]);
  const [showRescheduled, setShowRescheduled] = useState(false);

  useEffect(() => {
    loadBlockDays();
  }, []);

  async function loadBlockDays() {
    try {
      setLoading(true);
      const res = await fetch("/api/preferences");
      if (res.ok) {
        const json = await res.json();
        setBlockDays(json.data?.blockDays ?? []);
      }
    } catch {
      toast.error("Error al cargar días bloqueados");
    } finally {
      setLoading(false);
    }
  }

  // Set of YYYY-MM-DD keys for blocked-day calendar markers (uniform red regardless of category)
  const blockedDayKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of blockDays) {
      const d = new Date(b.date);
      s.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }
    return s;
  }, [blockDays]);

  const allRanges = useMemo(() => groupIntoRanges(blockDays), [blockDays]);
  const filteredRanges = useMemo(
    () => (filter === "ALL" ? allRanges : allRanges.filter((r) => r.category === filter)),
    [allRanges, filter]
  );

  const counts = useMemo(() => {
    const c: Record<BlockDayCategory | "ALL", number> = {
      ALL: allRanges.length,
      VACATION: 0,
      HOLIDAY: 0,
      CONFERENCE: 0,
      OTHER: 0,
    };
    for (const r of allRanges) c[r.category]++;
    return c;
  }, [allRanges]);

  function handlePickDate(d: Date) {
    // First click: set start. Second click: set end + open dialog.
    if (!pickFrom || (pickFrom && pickTo)) {
      setPickFrom(d);
      setPickTo(null);
    } else {
      if (isBefore(d, pickFrom)) {
        setPickTo(pickFrom);
        setPickFrom(d);
      } else {
        setPickTo(d);
      }
      setShowCreate(true);
    }
  }

  async function removeRange(ids: string[]) {
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch("/api/preferences/block-days", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          })
        )
      );
      // Antes se daba por eliminado sin mirar la respuesta.
      if (results.some((r) => !r.ok)) throw new Error("delete failed");
      setBlockDays((prev) => prev.filter((b) => !ids.includes(b.id)));
      toast.success("Bloqueo eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  const totalDays = blockDays.length;
  const rangeCount = allRanges.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarX className="h-5 w-5 text-primary" />
                Días bloqueados
              </CardTitle>
              <CardDescription>
                Bloqueá fechas puntuales o rangos (vacaciones, feriados, congresos). Hacé click en una fecha del calendario para empezar.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-baseline gap-1">
                <span className="font-semibold text-primary">{rangeCount}</span>
                <span className="text-xs text-muted-foreground">{rangeCount === 1 ? "rango" : "rangos"}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-semibold">{totalDays}</span>
                <span className="text-xs text-muted-foreground">{totalDays === 1 ? "día" : "días"}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
              {/* Calendar */}
              <div className="flex flex-col gap-2">
                <MiniCalendar
                  month={month}
                  setMonth={setMonth}
                  selectedRange={{ from: pickFrom, to: pickTo }}
                  onPickDate={handlePickDate}
                  blockedDayKeys={blockedDayKeys}
                />
                <p className="text-center text-xs text-muted-foreground">
                  <span className="font-medium">Tip:</span> hacé click en una fecha para empezar, y en otra para crear un rango.
                </p>
              </div>

              {/* Right side: filters + range list */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilter("ALL")}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      filter === "ALL"
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    Todos ({counts.ALL})
                  </button>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFilter(c)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                        filter === c
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[c]}`} />
                      {BLOCK_DAY_CATEGORY_LABELS[c]} ({counts[c]})
                    </button>
                  ))}
                </div>

                {filteredRanges.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {allRanges.length === 0
                      ? "Todavía no bloqueaste ningún día."
                      : "No hay bloqueos en esta categoría."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {filteredRanges.map((r) => {
                      const Icon = CATEGORY_ICONS[r.category];
                      return (
                        <div
                          key={r.ids[0]}
                          className="group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30"
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${CATEGORY_TILE[r.category]}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight">{rangeTitle(r)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{rangeDateLabel(r)}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            onClick={() => removeRange(r.ids)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo compartido con el calendario (components/configuracion/block-days-dialog.tsx) */}
      <BlockDaysDialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) {
            setPickFrom(null);
            setPickTo(null);
          }
        }}
        userId={userId}
        from={pickFrom}
        to={pickTo}
        onBlocked={({ rescheduled: moved }) => {
          setPickFrom(null);
          setPickTo(null);
          if (moved.length > 0) {
            setRescheduled(moved);
            setShowRescheduled(true);
          }
          loadBlockDays();
        }}
      />
      <RescheduledShiftsDialog open={showRescheduled} onOpenChange={setShowRescheduled} rescheduled={rescheduled} />
    </div>
  );
}
