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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateShiftDialog } from "@/components/shifts/create-shift-dialog";
import { ShiftDetailDialog } from "@/components/shifts/shift-detail-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Stethoscope,
} from "lucide-react";
import type { Shift, ShiftStatus, UserPreference, BlockDay, Medic } from "@/types";
import {
  SHIFT_STATUS_DOT_COLORS,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_COLORS,
  MONTH_NAMES,
} from "@/types";

import { MonthView } from "@/components/calendar/month-view";
import { WeekView } from "@/components/calendar/week-view";
import { DayView } from "@/components/calendar/day-view";
import { SidePanel } from "@/components/calendar/side-panel";
import {
  pad,
  formatTime,
  isSameDay,
  dateToYMD,
  getMonday,
  HOURS_START,
  HOURS_END,
} from "@/components/calendar/calendar-helpers";

type ViewMode = "month" | "week" | "day";

export default function CalendarioPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [blockDays, setBlockDays] = useState<BlockDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [createDefaultTime, setCreateDefaultTime] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [scheduleNextPatient, setScheduleNextPatient] = useState<{
    patientId: string;
    medicId: string;
  } | null>(null);

  // Medic filter (for secretary/admin)
  const [medics, setMedics] = useState<Medic[]>([]);
  const [selectedMedicId, setSelectedMedicId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = userRole === "secretary" || userRole === "admin";

  // Init medic filter from URL param
  useEffect(() => {
    const medicoParam = searchParams.get("medico");
    if (medicoParam) setSelectedMedicId(medicoParam);
  }, [searchParams]);

  // Fetch medics list for staff
  useEffect(() => {
    if (!isStaff) return;
    async function loadMedics() {
      try {
        const res = await fetch("/api/users/medics");
        if (res.ok) {
          const json = await res.json();
          setMedics(json.data ?? []);
        }
      } catch { /* non-critical */ }
    }
    loadMedics();
  }, [isStaff]);

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        month: String(month + 1),
        year: String(year),
      });
      // Staff filtering by selected medic
      if (isStaff && selectedMedicId) {
        params.set("userId", selectedMedicId);
      }
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
  }, [year, month, isStaff, selectedMedicId]);

  // Load availability for the relevant user (selected medic or self)
  const availabilityUserId = isStaff ? selectedMedicId : userId;

  const fetchAvailability = useCallback(async () => {
    if (!availabilityUserId) {
      setPreferences([]);
      setBlockDays([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        month: String(month + 1),
        year: String(year),
      });
      const res = await fetch(`/api/users/${availabilityUserId}/availability?${params}`);
      if (res.ok) {
        const json = await res.json();
        setPreferences(json.data?.preferences ?? []);
        setBlockDays(json.data?.blockDays ?? []);
      }
    } catch {
      // Non-critical
    }
  }, [availabilityUserId, year, month]);

  useEffect(() => {
    fetchShifts();
    fetchAvailability();
  }, [fetchShifts, fetchAvailability]);

  // Navigation
  function navigate(direction: -1 | 1) {
    const d = new Date(currentDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + direction);
    } else if (viewMode === "week") {
      d.setDate(d.getDate() + 7 * direction);
    } else {
      d.setDate(d.getDate() + direction);
    }
    setCurrentDate(d);
    setSelectedDate(null);
  }

  function goToday() {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  }

  // Blocked day check
  function isDayBlocked(date: Date): boolean {
    const ymd = dateToYMD(date);
    return blockDays.some((b) => {
      const bDate = new Date(b.date);
      return dateToYMD(bDate) === ymd;
    });
  }

  // Get work hours for a day of week (0=Sun, 1=Mon, ... 6=Sat)
  function getWorkHoursForDay(dayOfWeek: number): UserPreference | undefined {
    return preferences.find((p) => p.day === dayOfWeek);
  }

  function isWithinWorkHours(dayOfWeek: number, hour: number): boolean {
    const pref = getWorkHoursForDay(dayOfWeek);
    if (!pref) return false;

    let inAM = false;
    let inPM = false;

    if (pref.fromHourAM && pref.toHourAM) {
      const fromH = parseInt(pref.fromHourAM.split(":")[0], 10);
      const toH = parseInt(pref.toHourAM.split(":")[0], 10);
      if (hour >= fromH && hour < toH) inAM = true;
    }
    if (pref.fromHourPM && pref.toHourPM) {
      const fromH = parseInt(pref.fromHourPM.split(":")[0], 10);
      const toH = parseInt(pref.toHourPM.split(":")[0], 10);
      if (hour >= fromH && hour < toH) inPM = true;
    }

    return inAM || inPM;
  }

  function getWorkScheduleText(dayOfWeek: number): string {
    const pref = getWorkHoursForDay(dayOfWeek);
    if (!pref) return "Sin horario configurado";

    const parts: string[] = [];
    if (pref.fromHourAM && pref.toHourAM) {
      parts.push(`Manana: ${pref.fromHourAM} - ${pref.toHourAM}`);
    }
    if (pref.fromHourPM && pref.toHourPM) {
      parts.push(`Tarde: ${pref.fromHourPM} - ${pref.toHourPM}`);
    }
    return parts.length > 0 ? parts.join(" / ") : "Sin horario configurado";
  }

  // Get shifts for a specific day
  function getShiftsForDay(date: Date): Shift[] {
    return shifts.filter((s) => isSameDay(new Date(s.start), date));
  }

  function isToday(date: Date): boolean {
    return isSameDay(date, new Date());
  }

  function isSelected(date: Date): boolean {
    if (!selectedDate) return false;
    return isSameDay(date, selectedDate);
  }

  // Create shift from slot
  function handleSlotClick(date: Date, hour: number) {
    setSelectedDate(date);
    setCreateDefaultTime({
      start: `${pad(hour)}:00`,
      end: `${pad(hour)}:30`,
    });
    setCreateOpen(true);
  }

  function handleCreateOpen(date?: Date) {
    if (date) setSelectedDate(date);
    setCreateDefaultTime(null);
    setCreateOpen(true);
  }

  // ─── Month View ───────────────────────────────────────────────────────
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays: (number | null)[] = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [firstDayOfMonth, daysInMonth]);

  // ─── Week View ────────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const monday = getMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Selected day data
  const selectedDayShifts = selectedDate ? getShiftsForDay(selectedDate) : [];
  const selectedDayBlocked = selectedDate ? isDayBlocked(selectedDate) : false;
  const selectedDayStats = useMemo(() => {
    const total = selectedDayShifts.length;
    const pending = selectedDayShifts.filter(
      (s) => s.status === "PENDING"
    ).length;
    const finished = selectedDayShifts.filter(
      (s) => s.status === "FINISHED"
    ).length;
    return { total, pending, finished };
  }, [selectedDayShifts]);

  // Calculate shift position in week/day grid
  function getShiftPosition(shift: Shift): {
    top: number;
    height: number;
  } {
    const start = new Date(shift.start);
    const end = new Date(shift.end);
    const startMinutes =
      (start.getHours() - HOURS_START) * 60 + start.getMinutes();
    const endMinutes =
      (end.getHours() - HOURS_START) * 60 + end.getMinutes();
    const totalMinutes = (HOURS_END - HOURS_START) * 60;
    return {
      top: (startMinutes / totalMinutes) * 100,
      height: Math.max(((endMinutes - startMinutes) / totalMinutes) * 100, 1.5),
    };
  }

  // ─── Drag & Drop ────────────────────────────────────────────────────
  const [draggingShift, setDraggingShift] = useState<Shift | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingShift(null);
    const { active, over } = event;
    if (!over) return;

    const shiftId = active.id as string;
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    // Only allow dragging PENDING or CONFIRMED shifts
    if (shift.status !== "PENDING" && shift.status !== "CONFIRMED") return;

    // Parse drop target: "slot-{dateISO}-{hour}"
    const dropId = over.id as string;
    if (!dropId.startsWith("slot-")) return;

    const parts = dropId.split("-");
    const dropDateStr = parts.slice(1, 4).join("-"); // YYYY-MM-DD
    const dropHour = parseInt(parts[4], 10);

    // Calculate new start/end preserving duration
    const oldStart = new Date(shift.start);
    const oldEnd = new Date(shift.end);
    const durationMs = oldEnd.getTime() - oldStart.getTime();

    const newStart = new Date(dropDateStr + "T00:00:00");
    newStart.setHours(dropHour, 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Skip if same time
    if (newStart.getTime() === oldStart.getTime()) return;

    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
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

  // Title for header
  function getHeaderTitle(): string {
    if (viewMode === "month") {
      return `${MONTH_NAMES[month]} ${year}`;
    }
    if (viewMode === "week") {
      const mon = weekDays[0];
      const sun = weekDays[6];
      if (mon.getMonth() === sun.getMonth()) {
        return `${mon.getDate()} - ${sun.getDate()} de ${MONTH_NAMES[mon.getMonth()]} ${mon.getFullYear()}`;
      }
      return `${mon.getDate()} ${MONTH_NAMES[mon.getMonth()].substring(0, 3)} - ${sun.getDate()} ${MONTH_NAMES[sun.getMonth()].substring(0, 3)} ${sun.getFullYear()}`;
    }
    // day
    return `${currentDate.getDate()} de ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Calendario</h1>
            <p className="text-muted-foreground">
              Gestiona tus turnos y citas
            </p>
          </div>
          {/* Medic filter for staff */}
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
                {medics.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.lastName
                      ? `${m.lastName}${m.firstName ? `, ${m.firstName}` : ""}`
                      : m.name ?? "Profesional"}
                    {m.specialization?.name ? ` — ${m.specialization.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "ghost"}
                size="sm"
                className="rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => setViewMode(mode)}
              >
                {mode === "month" ? "Mes" : mode === "week" ? "Semana" : "Dia"}
              </Button>
            ))}
          </div>
          <Button onClick={() => handleCreateOpen()}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Turno
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        {/* Main Calendar Area */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{getHeaderTitle()}</CardTitle>
                <Button variant="outline" size="sm" onClick={goToday}>
                  Hoy
                </Button>
              </div>
              <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : viewMode === "month" ? (
              <MonthView
                calendarDays={calendarDays}
                year={year}
                month={month}
                getShiftsForDay={(day) =>
                  getShiftsForDay(new Date(year, month, day))
                }
                isDayBlocked={(day) => isDayBlocked(new Date(year, month, day))}
                isToday={(day) => isToday(new Date(year, month, day))}
                isSelected={(day) => isSelected(new Date(year, month, day))}
                onSelectDay={(day) =>
                  setSelectedDate(new Date(year, month, day))
                }
                showMedicInitials={!selectedMedicId}
              />
            ) : viewMode === "week" ? (
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
                  getShiftsForDay={getShiftsForDay}
                  isDayBlocked={isDayBlocked}
                  isToday={isToday}
                  isSelected={isSelected}
                  isWithinWorkHours={isWithinWorkHours}
                  getShiftPosition={getShiftPosition}
                  onSelectDay={setSelectedDate}
                  onSlotClick={handleSlotClick}
                  onShiftClick={(shift) => {
                    setSelectedShift(shift);
                    setDetailOpen(true);
                  }}
                />
                <DragOverlay>
                  {draggingShift && (
                    <div className={`rounded border px-2 py-1 text-[10px] shadow-lg ${SHIFT_STATUS_COLORS[draggingShift.status]}`}>
                      {draggingShift.patient
                        ? `${draggingShift.patient.lastName}`
                        : "Turno"}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={(e) => {
                  const s = shifts.find((sh) => sh.id === e.active.id);
                  if (s) setDraggingShift(s);
                }}
                onDragEnd={handleDragEnd}
              >
                <DayView
                  date={currentDate}
                  shifts={getShiftsForDay(currentDate)}
                  isBlocked={isDayBlocked(currentDate)}
                  isWithinWorkHours={(hour) =>
                    isWithinWorkHours(currentDate.getDay(), hour)
                  }
                  getShiftPosition={getShiftPosition}
                  onSlotClick={(hour) => handleSlotClick(currentDate, hour)}
                  onShiftClick={(shift) => {
                    setSelectedShift(shift);
                    setDetailOpen(true);
                  }}
                />
                <DragOverlay>
                  {draggingShift && (
                    <div className={`rounded border px-2 py-1 text-xs shadow-lg ${SHIFT_STATUS_COLORS[draggingShift.status]}`}>
                      {draggingShift.patient
                        ? `${draggingShift.patient.lastName}, ${draggingShift.patient.firstName}`
                        : "Turno"}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </CardContent>
        </Card>

        {/* Side Panel */}
        <SidePanel
          selectedDate={selectedDate}
          selectedDayShifts={selectedDayShifts}
          selectedDayBlocked={selectedDayBlocked}
          selectedDayStats={selectedDayStats}
          availabilityUserId={availabilityUserId}
          isStaff={isStaff}
          selectedMedicId={selectedMedicId}
          getWorkScheduleText={getWorkScheduleText}
          onShiftClick={(shift) => {
            setSelectedShift(shift);
            setDetailOpen(true);
          }}
          onCreateOpen={handleCreateOpen}
        />
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-4">
        {(Object.keys(SHIFT_STATUS_LABELS) as ShiftStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${SHIFT_STATUS_DOT_COLORS[status]}`}
            />
            <span className="text-xs text-muted-foreground">
              {SHIFT_STATUS_LABELS[status]}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="text-xs text-muted-foreground">Bloqueado</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-amber-500">ST</span>
          <span className="text-xs text-muted-foreground">Sobreturno</span>
        </div>
      </div>

      <CreateShiftDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={selectedDate ?? undefined}
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

      {/* Create shift dialog for scheduling next appointment */}
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
