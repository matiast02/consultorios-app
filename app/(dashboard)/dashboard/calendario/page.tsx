"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Lock, Plus, Stethoscope, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateShiftDialog } from "@/components/shifts/create-shift-dialog";
import { ShiftDetailDialog } from "@/components/shifts/shift-detail-dialog";

import { CalendarToolbar, type ViewMode, type StateFilter } from "@/components/calendar/toolbar";
import { MonthView } from "@/components/calendar/month-view";
import { WeekView } from "@/components/calendar/week-view";
import { DayView } from "@/components/calendar/day-view";
import { AgendaView } from "@/components/calendar/agenda-view";
import { Rail } from "@/components/calendar/rail";
import {
  AGENDA_DAYS,
  addDays,
  capacityFromPreference,
  capitalize,
  dateToYMD,
  fmtDayLong,
  fmtMonthYear,
  getSunday,
  isSameDay,
  pad,
  shiftToState,
} from "@/components/calendar/calendar-helpers";

import type { Shift, UserPreference, BlockDay, Medic } from "@/types";

export default function CalendarioPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>("mes");
  const [anchor, setAnchor] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [blockDays, setBlockDays] = useState<BlockDay[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultTime, setCreateDefaultTime] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [scheduleNextPatient, setScheduleNextPatient] = useState<{
    patientId: string;
    medicId: string;
  } | null>(null);

  // Toolbar filters
  const [stateFilter, setStateFilter] = useState<StateFilter>("todos");
  const [query, setQuery] = useState("");

  // Medic filter (staff)
  const [medics, setMedics] = useState<Medic[]>([]);
  const [selectedMedicId, setSelectedMedicId] = useState<string | null>(null);

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = userRole === "secretary" || userRole === "admin";
  const availabilityUserId = isStaff ? selectedMedicId : userId;

  const today = useMemo(() => new Date(), []);

  // ─── URL → state (medic) ────────────────────────────────────────────────────
  useEffect(() => {
    const medicoParam = searchParams.get("medico");
    if (medicoParam) setSelectedMedicId(medicoParam);
  }, [searchParams]);

  useEffect(() => {
    if (!isStaff) return;
    async function load() {
      try {
        const res = await fetch("/api/users/medics");
        if (res.ok) {
          const json = await res.json();
          setMedics(json.data ?? []);
        }
      } catch {
        /* non-critical */
      }
    }
    load();
  }, [isStaff]);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        month: String(anchor.getMonth() + 1),
        year: String(anchor.getFullYear()),
      });
      if (isStaff && selectedMedicId) params.set("userId", selectedMedicId);
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
  }, [anchor, isStaff, selectedMedicId]);

  const fetchAvailability = useCallback(async () => {
    if (!availabilityUserId) {
      setPreferences([]);
      setBlockDays([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        month: String(anchor.getMonth() + 1),
        year: String(anchor.getFullYear()),
      });
      const res = await fetch(
        `/api/users/${availabilityUserId}/availability?${params}`
      );
      if (res.ok) {
        const json = await res.json();
        setPreferences(json.data?.preferences ?? []);
        setBlockDays(json.data?.blockDays ?? []);
      }
    } catch {
      /* non-critical */
    }
  }, [availabilityUserId, anchor]);

  useEffect(() => {
    fetchShifts();
    fetchAvailability();
  }, [fetchShifts, fetchAvailability]);

  // ─── Derived: filtered shifts ───────────────────────────────────────────────
  const filteredShifts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shifts.filter((s) => {
      if (stateFilter !== "todos" && shiftToState(s) !== stateFilter) return false;
      if (q) {
        const name = `${s.patient?.lastName ?? ""} ${s.patient?.firstName ?? ""}`.toLowerCase();
        const obs = (s.observations ?? "").toLowerCase();
        const ct = (s.consultationType?.name ?? "").toLowerCase();
        if (!name.includes(q) && !obs.includes(q) && !ct.includes(q)) return false;
      }
      return true;
    });
  }, [shifts, stateFilter, query]);

  // ─── Derived: helpers ───────────────────────────────────────────────────────
  const getShiftsForDay = useCallback(
    (day: Date) =>
      filteredShifts
        .filter((s) => isSameDay(new Date(s.start), day))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [filteredShifts]
  );

  const getPreference = useCallback(
    (dayOfWeek: number) => preferences.find((p) => p.day === dayOfWeek),
    [preferences]
  );

  const isDayBlocked = useCallback(
    (day: Date) => {
      const ymd = dateToYMD(day);
      return blockDays.some((b) => dateToYMD(new Date(b.date)) === ymd);
    },
    [blockDays]
  );

  const blockedReason = useCallback(
    (day: Date) => {
      const ymd = dateToYMD(day);
      const b = blockDays.find((b) => dateToYMD(new Date(b.date)) === ymd);
      return b ? b.note ?? "Bloqueado" : null;
    },
    [blockDays]
  );

  // ─── Month cells ────────────────────────────────────────────────────────────
  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const firstDow = first.getDay(); // Sunday = 0
    const daysInMonth = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0
    ).getDate();
    const out: {
      date: Date;
      otherMonth: boolean;
      shifts: Shift[];
      capacity: number;
      blocked: boolean;
      blockedReason?: string | null;
    }[] = [];

    const pushDay = (d: Date, otherMonth: boolean) => {
      const cap = capacityFromPreference(getPreference(d.getDay()));
      out.push({
        date: d,
        otherMonth,
        shifts: getShiftsForDay(d),
        capacity: cap,
        blocked: isDayBlocked(d),
        blockedReason: blockedReason(d),
      });
    };

    for (let i = firstDow; i > 0; i--) {
      pushDay(
        new Date(anchor.getFullYear(), anchor.getMonth(), 1 - i),
        true
      );
    }
    for (let d = 1; d <= daysInMonth; d++) {
      pushDay(new Date(anchor.getFullYear(), anchor.getMonth(), d), false);
    }
    while (out.length % 7) {
      const last = out[out.length - 1].date;
      pushDay(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), true);
    }
    while (out.length < 42) {
      const last = out[out.length - 1].date;
      pushDay(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), true);
    }
    return out;
  }, [anchor, getShiftsForDay, getPreference, isDayBlocked, blockedReason]);

  // ─── Week days (Sun..Sat anchored on selectedDay) ──────────────────────────
  const weekDays = useMemo(() => {
    const start = getSunday(selectedDay);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDay]);

  // ─── Agenda window ──────────────────────────────────────────────────────────
  const agendaShifts = useMemo(() => {
    const start = new Date(
      selectedDay.getFullYear(),
      selectedDay.getMonth(),
      selectedDay.getDate()
    );
    const end = addDays(start, AGENDA_DAYS);
    return filteredShifts
      .filter((s) => {
        const t = new Date(s.start).getTime();
        return t >= start.getTime() && t < end.getTime();
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [filteredShifts, selectedDay]);

  // ─── Toolbar label ──────────────────────────────────────────────────────────
  const label = useMemo(() => {
    if (view === "mes") return fmtMonthYear(anchor);
    if (view === "semana") {
      const s = weekDays[0];
      const e = weekDays[6];
      const sMonth = capitalize(s.toLocaleDateString("es-AR", { month: "short" }));
      const eMonth = capitalize(
        e.toLocaleDateString("es-AR", { month: "short", year: "numeric" })
      );
      return `${s.getDate()} ${sMonth} – ${e.getDate()} ${eMonth}`;
    }
    if (view === "dia") return fmtDayLong(selectedDay);
    return `Próximos ${AGENDA_DAYS} días`;
  }, [view, anchor, weekDays, selectedDay]);

  // ─── Navigation ─────────────────────────────────────────────────────────────
  function navPrev() {
    if (view === "mes")
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
    else if (view === "semana") setSelectedDay((d) => addDays(d, -7));
    else if (view === "dia") setSelectedDay((d) => addDays(d, -1));
    else setSelectedDay((d) => addDays(d, -AGENDA_DAYS));
  }
  function navNext() {
    if (view === "mes")
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
    else if (view === "semana") setSelectedDay((d) => addDays(d, 7));
    else if (view === "dia") setSelectedDay((d) => addDays(d, 1));
    else setSelectedDay((d) => addDays(d, AGENDA_DAYS));
  }
  function goToday() {
    const t = new Date();
    setSelectedDay(t);
    setAnchor(new Date(t.getFullYear(), t.getMonth(), 1));
  }

  // Keep anchor in sync with selectedDay when the user clicks a date that's in
  // another month from inside the month grid.
  function handleSelectDay(d: Date) {
    setSelectedDay(d);
    if (d.getMonth() !== anchor.getMonth() || d.getFullYear() !== anchor.getFullYear()) {
      setAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }

  // ─── Create / detail dialogs ────────────────────────────────────────────────
  function handleSlotClick(date: Date, hour: number, minute = 0) {
    setSelectedDay(date);
    setCreateDefaultTime({
      start: `${pad(hour)}:${pad(minute)}`,
      end: `${pad(hour + (minute >= 30 ? 1 : 0))}:${pad((minute + 30) % 60)}`,
    });
    setCreateOpen(true);
  }
  function handleCreateOpen(date?: Date) {
    if (date) setSelectedDay(date);
    setCreateDefaultTime(null);
    setCreateOpen(true);
  }
  function handleSelectShift(s: Shift) {
    setSelectedShift(s);
    setDetailOpen(true);
  }

  // ─── Drag & Drop ────────────────────────────────────────────────────────────
  const [draggingShift, setDraggingShift] = useState<Shift | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingShift(null);
    const { active, over } = event;
    if (!over) return;

    const shift = shifts.find((s) => s.id === active.id);
    if (!shift) return;
    if (shift.status !== "PENDING" && shift.status !== "CONFIRMED") return;

    const dropId = over.id as string;
    if (!dropId.startsWith("slot-")) return;

    const parts = dropId.split("-");
    const dropDateStr = parts.slice(1, 4).join("-");
    const dropHour = parseInt(parts[4], 10);

    const oldStart = new Date(shift.start);
    const oldEnd = new Date(shift.end);
    const durationMs = oldEnd.getTime() - oldStart.getTime();

    const newStart = new Date(dropDateStr + "T00:00:00");
    newStart.setHours(dropHour, 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    if (newStart.getTime() === oldStart.getTime()) return;

    try {
      const res = await fetch(`/api/shifts/${shift.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "No se pudo mover el turno");
        return;
      }
      toast.success(
        `Turno movido a ${pad(dropHour)}:00 del ${newStart.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}`
      );
      fetchShifts();
    } catch {
      toast.error("Error al mover el turno");
    }
  }

  // Selected-day shifts for the rail
  const selectedDayShifts = useMemo(
    () => getShiftsForDay(selectedDay),
    [getShiftsForDay, selectedDay]
  );

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Page head */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Calendario</h1>
            <p className="text-sm text-muted-foreground">
              Gestioná tus turnos, huecos libres y agenda diaria.
            </p>
          </div>
          {isStaff && medics.length > 0 && (
            <Select
              value={selectedMedicId ?? "__all__"}
              onValueChange={(val) =>
                setSelectedMedicId(val === "__all__" ? null : val)
              }
            >
              <SelectTrigger className="w-[220px]">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-3.5 w-3.5 text-primary" />
                  <SelectValue placeholder="Todos los profesionales" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los profesionales</SelectItem>
                {medics.map((m) => {
                  const name = m.lastName
                    ? `${m.lastName}${m.firstName ? `, ${m.firstName}` : ""}`
                    : m.name ?? "Profesional";
                  const profName = m.specialization?.professionConfig?.name;
                  const detail =
                    profName && profName !== "Médico"
                      ? profName
                      : m.specialization?.name ?? null;
                  return (
                    <SelectItem key={m.id} value={m.id}>
                      {name}
                      {detail ? ` — ${detail}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            Bloquear horario
          </Button>
          <Button size="sm" onClick={() => handleCreateOpen()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo turno
            <kbd className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded border border-white/30 bg-white/10 px-1 font-mono text-[10px] font-semibold leading-none text-white/80">
              N
            </kbd>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <CalendarToolbar
        view={view}
        onViewChange={setView}
        label={label}
        onToday={goToday}
        onPrev={navPrev}
        onNext={navNext}
        query={query}
        onQueryChange={setQuery}
        stateFilter={stateFilter}
        onStateFilterChange={setStateFilter}
      />

      {/* Body */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {loading ? (
            <div className="flex h-72 items-center justify-center rounded-[10px] border bg-card shadow-xs">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : view === "mes" ? (
            <MonthView
              anchor={anchor}
              selectedDay={selectedDay}
              today={today}
              cells={monthCells}
              onSelectDay={handleSelectDay}
              onSelectShift={handleSelectShift}
            />
          ) : view === "semana" ? (
            <DndContext
              sensors={sensors}
              onDragStart={(e) => {
                const s = shifts.find((sh) => sh.id === e.active.id);
                if (s) setDraggingShift(s);
              }}
              onDragEnd={handleDragEnd}
            >
              <WeekView
                weekDays={weekDays}
                today={today}
                getPreference={getPreference}
                isDayBlocked={isDayBlocked}
                getShiftsForDay={getShiftsForDay}
                selectedShiftId={selectedShift?.id}
                onSelectDay={handleSelectDay}
                onSlotClick={(d, hour) => handleSlotClick(d, hour)}
                onSelectShift={handleSelectShift}
              />
              <DragOverlay>
                {draggingShift && (
                  <div className="rounded-md border border-primary/40 bg-card px-2 py-1 text-[11px] font-semibold text-foreground shadow-md">
                    {draggingShift.patient
                      ? `${draggingShift.patient.lastName}, ${draggingShift.patient.firstName?.[0] ?? ""}.`
                      : "Turno"}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          ) : view === "dia" ? (
            <DndContext
              sensors={sensors}
              onDragStart={(e) => {
                const s = shifts.find((sh) => sh.id === e.active.id);
                if (s) setDraggingShift(s);
              }}
              onDragEnd={handleDragEnd}
            >
              <DayView
                date={selectedDay}
                today={today}
                preference={getPreference(selectedDay.getDay())}
                shifts={selectedDayShifts}
                isBlocked={isDayBlocked(selectedDay)}
                selectedShiftId={selectedShift?.id}
                onSlotClick={(hour, minute) => handleSlotClick(selectedDay, hour, minute)}
                onSelectShift={handleSelectShift}
              />
              <DragOverlay>
                {draggingShift && (
                  <div className="rounded-md border border-primary/40 bg-card px-2 py-1 text-xs font-semibold text-foreground shadow-md">
                    {draggingShift.patient
                      ? `${draggingShift.patient.lastName}, ${draggingShift.patient.firstName}`
                      : "Turno"}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          ) : (
            <AgendaView
              shifts={agendaShifts}
              today={today}
              onSelectShift={handleSelectShift}
            />
          )}
        </div>

        {/* Right rail */}
        <Rail
          anchor={anchor}
          selectedDay={selectedDay}
          today={today}
          allMonthShifts={shifts}
          selectedDayShifts={selectedDayShifts}
          selectedShiftId={selectedShift?.id}
          isStaff={isStaff}
          hasSelectedMedic={!!availabilityUserId}
          onSelectDay={handleSelectDay}
          onMonthChange={setAnchor}
          onSelectShift={handleSelectShift}
          onCreateOpen={(d) => handleCreateOpen(d)}
        />
      </div>

      {/* Dialogs */}
      <CreateShiftDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={selectedDay}
        defaultStartTime={createDefaultTime?.start}
        defaultEndTime={createDefaultTime?.end}
        onCreated={() => {
          fetchShifts();
          setCreateOpen(false);
          setCreateDefaultTime(null);
        }}
      />

      {selectedShift && (
        <ShiftDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          shift={selectedShift}
          onUpdated={() => {
            fetchShifts();
            setDetailOpen(false);
            setSelectedShift(null);
          }}
          onScheduleNext={(patientId, medicId) => {
            setDetailOpen(false);
            setSelectedShift(null);
            setScheduleNextPatient({ patientId, medicId });
          }}
          onReschedule={(patientId, medicId) => {
            setDetailOpen(false);
            setSelectedShift(null);
            fetchShifts();
            setScheduleNextPatient({ patientId, medicId });
          }}
        />
      )}

      {scheduleNextPatient && !createOpen && (
        <CreateShiftDialog
          open={!!scheduleNextPatient}
          onOpenChange={(open) => {
            if (!open) setScheduleNextPatient(null);
          }}
          defaultPatientId={scheduleNextPatient.patientId}
          defaultMedicId={scheduleNextPatient.medicId}
          onCreated={() => {
            setScheduleNextPatient(null);
            fetchShifts();
          }}
        />
      )}
    </div>
  );
}
