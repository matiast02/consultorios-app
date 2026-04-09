"use client";

import { AlertTriangle, Clock, Plus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Shift } from "@/types";
import { SHIFT_STATUS_COLORS, SHIFT_STATUS_LABELS, MONTH_NAMES } from "@/types";
import { formatTime } from "./calendar-helpers";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SidePanelProps {
  selectedDate: Date | null;
  selectedDayShifts: Shift[];
  selectedDayBlocked: boolean;
  selectedDayStats: { total: number; pending: number; finished: number };
  availabilityUserId: string | null | undefined;
  isStaff: boolean;
  selectedMedicId: string | null;
  getWorkScheduleText: (dayOfWeek: number) => string;
  onShiftClick: (shift: Shift) => void;
  onCreateOpen: (date?: Date) => void;
  /** Label for the professional title (e.g. "Dr/a.", "Lic."). Defaults to "Prof." for multi-medic views. */
  professionLabel?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SidePanel({
  selectedDate,
  selectedDayShifts,
  selectedDayBlocked,
  selectedDayStats,
  availabilityUserId,
  isStaff,
  selectedMedicId,
  getWorkScheduleText,
  onShiftClick,
  onCreateOpen,
  professionLabel = "Prof.",
}: SidePanelProps) {
  return (
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

            {/* Work schedule — only show when a specific medic is selected */}
            {availabilityUserId && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Horario de atencion
                </div>
                <p className="text-sm text-muted-foreground pl-6">
                  {getWorkScheduleText(selectedDate.getDay())}
                </p>
              </div>
            )}

            <Separator />

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold">{selectedDayStats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{selectedDayStats.pending}</p>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{selectedDayStats.finished}</p>
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
                  onClick={() => onCreateOpen(selectedDate)}
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
                      new Date(a.start).getTime() - new Date(b.start).getTime()
                  )
                  .map((shift) => (
                    <button
                      key={shift.id}
                      onClick={() => onShiftClick(shift)}
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
                      {/* Show medic name when viewing all medics */}
                      {isStaff && !selectedMedicId && shift.user && (
                        <p className="mt-1 text-xs text-primary/80">
                          <Stethoscope className="mr-1 inline h-3 w-3" />
                          {shift.user.lastName
                            ? `${professionLabel} ${shift.user.lastName}`
                            : shift.user.name ?? "Profesional"}
                        </p>
                      )}
                      {/* Consultation type */}
                      {shift.consultationType && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          {shift.consultationType.color && (
                            <span
                              className="inline-block h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: shift.consultationType.color }}
                            />
                          )}
                          {shift.consultationType.name}
                        </p>
                      )}
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
  );
}
