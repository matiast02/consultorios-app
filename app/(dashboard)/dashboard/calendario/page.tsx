"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  Stethoscope,
} from "lucide-react";
import type { Shift, ShiftStatus, UserPreference, BlockDay, Medic } from "@/types";
import {
  SHIFT_STATUS_DOT_COLORS,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_COLORS,
  DAY_NAMES,
  MONTH_NAMES,
} from "@/types";

type ViewMode = "month" | "week" | "day";

// Hours range for week/day views
const HOURS_START = 7;
const HOURS_END = 21;
const HOUR_SLOTS = Array.from(
  { length: HOURS_END - HOURS_START },
  (_, i) => HOURS_START + i
);

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Get Monday of the week containing `date` */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

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
                  <SelectValue placeholder="Todos los medicos" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los medicos</SelectItem>
                {medics.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.lastName ? `Dr. ${m.lastName}` : m.name ?? "Medico"}
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
            ) : (
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
            )}
          </CardContent>
        </Card>

        {/* Side Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedDate
                ? `${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]}`
                : "Selecciona un dia"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground">
                Hace clic en un dia del calendario para ver los turnos.
              </p>
            ) : (
              <>
                {/* Blocked warning */}
                {selectedDayBlocked && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Este dia esta bloqueado</span>
                  </div>
                )}

                {/* Work schedule */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Horario de atencion
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {getWorkScheduleText(selectedDate.getDay())}
                  </p>
                </div>

                <Separator />

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold">
                      {selectedDayStats.total}
                    </p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {selectedDayStats.pending}
                    </p>
                    <p className="text-xs text-muted-foreground">Pendientes</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {selectedDayStats.finished}
                    </p>
                    <p className="text-xs text-muted-foreground">Finalizados</p>
                  </div>
                </div>

                <Separator />

                {/* Shifts list */}
                {selectedDayShifts.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      No hay turnos para este dia.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCreateOpen(selectedDate)}
                    >
                      <Plus className="mr-2 h-3 w-3" />
                      Crear turno
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayShifts
                      .sort(
                        (a, b) =>
                          new Date(a.start).getTime() -
                          new Date(b.start).getTime()
                      )
                      .map((shift) => (
                        <button
                          key={shift.id}
                          onClick={() => {
                            setSelectedShift(shift);
                            setDetailOpen(true);
                          }}
                          className="w-full rounded-lg border bg-card p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:bg-primary/5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {shift.patient
                                ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                                : "Paciente"}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${SHIFT_STATUS_COLORS[shift.status]}`}
                            >
                              {SHIFT_STATUS_LABELS[shift.status]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTime(new Date(shift.start))} -{" "}
                            {formatTime(new Date(shift.end))}
                          </p>
                          {shift.observations && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {shift.observations}
                            </p>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
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

// ─────────────────────────────────────────────────────────────────────────────
// Month View Component
// ─────────────────────────────────────────────────────────────────────────────

function MonthView({
  calendarDays,
  year,
  month,
  getShiftsForDay,
  isDayBlocked,
  isToday,
  isSelected,
  onSelectDay,
  showMedicInitials,
}: {
  calendarDays: (number | null)[];
  year: number;
  month: number;
  getShiftsForDay: (day: number) => Shift[];
  isDayBlocked: (day: number) => boolean;
  isToday: (day: number) => boolean;
  isSelected: (day: number) => boolean;
  onSelectDay: (day: number) => void;
  showMedicInitials?: boolean;
}) {
  return (
    <>
      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 gap-px">
        {DAY_NAMES.map((dayName) => (
          <div
            key={dayName}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {dayName.substring(0, 3)}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[80px]" />;
          }
          const dayShifts = getShiftsForDay(day);
          const blocked = isDayBlocked(day);
          return (
            <button
              key={day}
              onClick={() => onSelectDay(day)}
              className={`min-h-[80px] rounded-md border p-1 text-left transition-all duration-150 hover:bg-primary/5 ${
                isSelected(day)
                  ? "border-primary bg-primary/8"
                  : "border-transparent"
              } ${isToday(day) ? "bg-accent/60" : ""} ${
                blocked ? "bg-amber-50 dark:bg-amber-950/20" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  {day}
                </span>
                {blocked && (
                  <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase">
                    Bloq.
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayShifts.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <div
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${SHIFT_STATUS_DOT_COLORS[s.status]}`}
                    />
                    <span className="truncate text-[10px] text-muted-foreground">
                      {s.recurrenceGroupId && (
                        <span className="mr-0.5 text-blue-400">↻</span>
                      )}
                      {s.isOverbook && (
                        <span className="mr-0.5 font-bold text-amber-500">ST</span>
                      )}
                      {showMedicInitials && s.user?.lastName
                        ? `${s.user.lastName.substring(0, 3)}. `
                        : ""}
                      {formatTime(new Date(s.start))}
                    </span>
                  </div>
                ))}
                {dayShifts.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{dayShifts.length - 3} mas
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Week View Component
// ─────────────────────────────────────────────────────────────────────────────

function WeekView({
  weekDays,
  getShiftsForDay,
  isDayBlocked,
  isToday,
  isSelected,
  isWithinWorkHours,
  getShiftPosition,
  onSelectDay,
  onSlotClick,
  onShiftClick,
}: {
  weekDays: Date[];
  getShiftsForDay: (date: Date) => Shift[];
  isDayBlocked: (date: Date) => boolean;
  isToday: (date: Date) => boolean;
  isSelected: (date: Date) => boolean;
  isWithinWorkHours: (dayOfWeek: number, hour: number) => boolean;
  getShiftPosition: (shift: Shift) => { top: number; height: number };
  onSelectDay: (date: Date) => void;
  onSlotClick: (date: Date, hour: number) => void;
  onShiftClick: (shift: Shift) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
          <div /> {/* spacer for time column */}
          {weekDays.map((day) => (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`p-2 text-center border-l transition-colors hover:bg-accent ${
                isSelected(day) ? "bg-accent" : ""
              }`}
            >
              <div className="text-xs text-muted-foreground">
                {DAY_NAMES[day.getDay()].substring(0, 3)}
              </div>
              <div
                className={`mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                  isToday(day)
                    ? "bg-primary text-primary-foreground"
                    : ""
                }`}
              >
                {day.getDate()}
              </div>
              {isDayBlocked(day) && (
                <div className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase">
                  Bloqueado
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {/* Time labels */}
          <div>
            {HOUR_SLOTS.map((hour) => (
              <div
                key={hour}
                className="relative h-14 border-b pr-2 text-right"
              >
                <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">
                  {pad(hour)}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(day);
            const blocked = isDayBlocked(day);

            return (
              <div key={day.toISOString()} className="relative border-l">
                {/* Hour rows */}
                {HOUR_SLOTS.map((hour) => {
                  const withinWork = isWithinWorkHours(day.getDay(), hour);
                  return (
                    <div
                      key={hour}
                      onClick={() => !blocked && onSlotClick(day, hour)}
                      className={`h-14 border-b cursor-pointer transition-colors hover:bg-accent/50 ${
                        blocked
                          ? "bg-amber-50 dark:bg-amber-950/20"
                          : withinWork
                          ? "bg-card dark:bg-background"
                          : "bg-muted/40 dark:bg-muted/20"
                      }`}
                    />
                  );
                })}

                {/* Shift blocks (absolutely positioned) */}
                {dayShifts.map((shift) => {
                  const pos = getShiftPosition(shift);
                  const totalHeight = HOUR_SLOTS.length * 56; // 56px = h-14
                  const topPx = (pos.top / 100) * totalHeight;
                  const heightPx = Math.max(
                    (pos.height / 100) * totalHeight,
                    20
                  );

                  return (
                    <div
                      key={shift.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShiftClick(shift);
                      }}
                      className={`absolute left-0.5 right-0.5 rounded border px-1 py-0.5 text-[10px] overflow-hidden cursor-pointer transition-opacity hover:opacity-80 ${shift.isOverbook ? "border-amber-500 border-dashed" : ""} ${SHIFT_STATUS_COLORS[shift.status]}`}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                      }}
                    >
                      <div className="font-medium truncate">
                        {shift.isOverbook && (
                          <span className="mr-0.5 text-amber-600 dark:text-amber-400">ST</span>
                        )}
                        {shift.patient
                          ? `${shift.patient.lastName}`
                          : "Turno"}
                      </div>
                      <div className="truncate">
                        {formatTime(new Date(shift.start))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Day View Component
// ─────────────────────────────────────────────────────────────────────────────

function DayView({
  date,
  shifts,
  isBlocked,
  isWithinWorkHours,
  getShiftPosition,
  onSlotClick,
  onShiftClick,
}: {
  date: Date;
  shifts: Shift[];
  isBlocked: boolean;
  isWithinWorkHours: (hour: number) => boolean;
  getShiftPosition: (shift: Shift) => { top: number; height: number };
  onSlotClick: (hour: number) => void;
  onShiftClick: (shift: Shift) => void;
}) {
  return (
    <div>
      {isBlocked && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Este dia esta bloqueado</span>
        </div>
      )}

      <div className="relative">
        {/* Time grid */}
        <div className="grid grid-cols-[60px_1fr]">
          {/* Time labels */}
          <div>
            {HOUR_SLOTS.map((hour) => (
              <div
                key={hour}
                className="relative h-16 border-b pr-2 text-right"
              >
                <span className="absolute -top-2 right-2 text-xs text-muted-foreground">
                  {pad(hour)}:00
                </span>
              </div>
            ))}
          </div>

          {/* Main column */}
          <div className="relative border-l">
            {/* Hour slots */}
            {HOUR_SLOTS.map((hour) => {
              const withinWork = isWithinWorkHours(hour);
              return (
                <div
                  key={hour}
                  onClick={() => !isBlocked && onSlotClick(hour)}
                  className={`h-16 border-b cursor-pointer transition-colors hover:bg-accent/50 ${
                    isBlocked
                      ? "bg-amber-50 dark:bg-amber-950/20"
                      : withinWork
                      ? "bg-card dark:bg-background"
                      : "bg-muted/40 dark:bg-muted/20"
                  }`}
                />
              );
            })}

            {/* Shift blocks */}
            {shifts.map((shift) => {
              const pos = getShiftPosition(shift);
              const totalHeight = HOUR_SLOTS.length * 64; // 64px = h-16
              const topPx = (pos.top / 100) * totalHeight;
              const heightPx = Math.max(
                (pos.height / 100) * totalHeight,
                28
              );

              return (
                <div
                  key={shift.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onShiftClick(shift);
                  }}
                  className={`absolute left-1 right-1 rounded-md border px-2 py-1 overflow-hidden cursor-pointer transition-opacity hover:opacity-80 ${shift.isOverbook ? "border-amber-500 border-dashed" : ""} ${SHIFT_STATUS_COLORS[shift.status]}`}
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">
                      {shift.isOverbook && (
                        <Badge variant="outline" className="mr-1 text-[9px] border-amber-500 text-amber-600 px-1 py-0">
                          ST
                        </Badge>
                      )}
                      {shift.patient
                        ? `${shift.patient.lastName}, ${shift.patient.firstName}`
                        : "Paciente"}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${SHIFT_STATUS_COLORS[shift.status]}`}
                    >
                      {SHIFT_STATUS_LABELS[shift.status]}
                    </Badge>
                  </div>
                  <p className="text-[11px] mt-0.5">
                    {formatTime(new Date(shift.start))} -{" "}
                    {formatTime(new Date(shift.end))}
                  </p>
                  {shift.observations && heightPx > 50 && (
                    <p className="text-[10px] mt-0.5 truncate opacity-80">
                      {shift.observations}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
