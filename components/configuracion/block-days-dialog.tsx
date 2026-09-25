"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format, isSameDay, startOfDay, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, CalendarX, Flag, Loader2, Mic2, Plane, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BLOCK_DAY_CATEGORY_LABELS, type BlockDayCategory } from "@/types";

// Diálogo «Bloquear fechas» y aviso de turnos reprogramados. Lo comparten
// Configuración → Bloqueados (rango elegido en el mini calendario) y el botón
// «Bloquear día» del calendario (día seleccionado). La API reprograma sola los
// turnos que caen en los días bloqueados y los devuelve en `rescheduledShifts`.

export const CATEGORY_ICONS: Record<BlockDayCategory, typeof Plane> = {
  VACATION: Plane,
  HOLIDAY: Flag,
  CONFERENCE: Mic2,
  OTHER: CalendarX,
};

// Icon tile colors (info-soft / violet-soft / warning-soft / gray-soft)
export const CATEGORY_TILE: Record<BlockDayCategory, string> = {
  VACATION: "bg-[#e1eef9] text-[#1d6db5] dark:bg-sky-950/50 dark:text-sky-300",
  HOLIDAY: "bg-[#f1e5fb] text-[#7b3fb6] dark:bg-violet-950/50 dark:text-violet-300",
  CONFERENCE: "bg-[#fcefdc] text-[#b46a13] dark:bg-amber-950/50 dark:text-amber-300",
  OTHER: "bg-[#e6edef] text-slate-600 dark:bg-slate-800/50 dark:text-slate-300",
};

export const CATEGORIES: BlockDayCategory[] = ["VACATION", "HOLIDAY", "CONFERENCE", "OTHER"];

export interface RescheduledShift {
  shiftId: string;
  patient: string;
  originalDate: string;
  newDate: string;
  originalTime: string;
}

export interface BlockDaysResult {
  /** YYYY-MM-DD bloqueados. */
  dates: string[];
  rescheduled: RescheduledShift[];
}

interface BlockDaysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Profesional al que se le bloquean los días (política en lib/agenda-access.ts). */
  userId: string | null | undefined;
  from: Date | null;
  to?: Date | null;
  onBlocked: (result: BlockDaysResult) => void;
}

export function BlockDaysDialog({ open, onOpenChange, userId, from, to, onBlocked }: BlockDaysDialogProps) {
  const [category, setCategory] = useState<BlockDayCategory>("VACATION");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("VACATION");
      setNote("");
    }
  }, [open]);

  const start = from ? startOfDay(from) : null;
  const end = to ? startOfDay(to) : start;
  const isRange = !!start && !!end && !isSameDay(start, end);

  async function confirm() {
    if (!start || !end) {
      toast.error("Seleccioná al menos una fecha");
      return;
    }
    if (!userId) {
      toast.error("Elegí un profesional");
      return;
    }
    const dates = eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
    setSaving(true);
    try {
      const res = await fetch("/api/preferences/block-days", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, dates, category, note: note || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al bloquear");
      }
      const { data } = await res.json();
      const rescheduled: RescheduledShift[] = data?.rescheduledShifts ?? [];
      if (rescheduled.length > 0) {
        toast.success(`Días bloqueados. ${rescheduled.length} turno(s) reprogramado(s).`);
      } else {
        toast.success(dates.length === 1 ? "Día bloqueado" : `${dates.length} días bloqueados`);
      }
      onOpenChange(false);
      onBlocked({ dates, rescheduled });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al bloquear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Bloquear fechas
          </DialogTitle>
          <DialogDescription>
            {start &&
              end &&
              (isRange
                ? `${format(start, "EEEE d/MM/yyyy", { locale: es })} → ${format(end, "EEEE d/MM/yyyy", { locale: es })}`
                : format(start, "EEEE d 'de' MMMM 'de' yyyy", { locale: es }))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c];
                const isSelected = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition-colors ${
                      isSelected ? `${CATEGORY_TILE[c]} border-2` : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {BLOCK_DAY_CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nota (opcional)</Label>
            <Textarea
              rows={2}
              maxLength={500}
              placeholder="Ej: vacaciones de invierno, congreso SAC 2026…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving || !start}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RescheduledShiftsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rescheduled: RescheduledShift[];
}

export function RescheduledShiftsDialog({ open, onOpenChange, rescheduled }: RescheduledShiftsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-amber-600" />
            Turnos reprogramados
          </DialogTitle>
          <DialogDescription>
            Se reprogramaron {rescheduled.length} turno(s) automáticamente para evitar conflictos con los días
            bloqueados.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {rescheduled.map((rs) => (
            <div key={rs.shiftId} className="space-y-1 rounded-lg border p-3">
              <p className="text-sm font-medium">{rs.patient}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {format(new Date(rs.originalDate), "EEEE d/MM/yyyy", { locale: es })} {rs.originalTime}
                </span>
                <ArrowRight className="h-3 w-3" />
                <span className="font-medium text-primary">
                  {format(new Date(rs.newDate), "EEEE d/MM/yyyy", { locale: es })} {rs.originalTime}
                </span>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
