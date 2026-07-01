"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  IdCard,
  Loader2,
  Mail,
  Phone,
  Printer,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Shift, ShiftStatus } from "@/types";

interface ShiftQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift & {
    user?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      name?: string | null;
      defaultRoom?: string | null;
      specialization?: { id: string; name: string; color?: string | null } | null;
    };
  };
  lastVisit?: { date: string; consultationTypeName: string | null } | null;
  nextScheduled?: { date: string; consultationTypeName: string | null; medicShortName: string } | null;
  onUpdated: () => void;
  onReschedule?: (shift: Shift) => void;
  onViewPatient?: (patientId: string) => void;
  /**
   * Override the right-most primary button. When omitted, the dialog uses its
   * default secretary behavior ("Pasó a consulta" → POST start-consultation).
   */
  primaryAction?: {
    label: string;
    onClick: (shift: Shift) => void;
    disabled?: boolean;
  };
}

const STATUS_LABEL: Record<ShiftStatus, string> = {
  PENDING: "PENDIENTE",
  CONFIRMED: "CONFIRMADO",
  ABSENT: "AUSENTE",
  FINISHED: "FINALIZADO",
  CANCELLED: "CANCELADO",
};

const STATUS_BADGE: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  CONFIRMED: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  ABSENT: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  FINISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  CANCELLED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const WEEKDAYS_SHORT_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAYS_SHORT_ES[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function formatHHmm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateDMY(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

function calcAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function initials(firstName: string, lastName: string): string {
  return `${(firstName[0] ?? "").toUpperCase()}${(lastName[0] ?? "").toUpperCase()}`;
}

function shortMedic(u: ShiftQuickDialogProps["shift"]["user"]): string {
  if (!u) return "Profesional";
  const fn = u.firstName ?? "";
  const ln = u.lastName ?? "";
  const honor = fn.toLowerCase().endsWith("a") ? "Dra." : "Dr.";
  if (ln) return `${honor} ${ln}`;
  return u.name ?? "Profesional";
}

function formatDni(dni: string | null | undefined): string | null {
  if (!dni) return null;
  const digits = dni.replace(/\D/g, "");
  if (digits.length < 7) return dni;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function relativeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return "recién";
  if (diff < 60) return `hace ${diff} s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h`;
}

export function ShiftQuickDialog({
  open,
  onOpenChange,
  shift,
  lastVisit,
  nextScheduled,
  onUpdated,
  onReschedule,
  onViewPatient,
  primaryAction,
}: ShiftQuickDialogProps) {
  const [observations, setObservations] = useState(shift.observations ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedValueRef = useRef<string>(shift.observations ?? "");
  const [nowTick, setNowTick] = useState(0);

  // Tick the "saved Xs ago" label every 20s
  useEffect(() => {
    if (!savedAt) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 20_000);
    return () => clearInterval(id);
  }, [savedAt]);
  void nowTick;

  // Sync local state if a different shift comes in (or when dialog opens fresh)
  useEffect(() => {
    setObservations(shift.observations ?? "");
    lastSavedValueRef.current = shift.observations ?? "";
    setSavedAt(null);
  }, [shift.id, shift.observations]);

  // ─── Autosave observations ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (observations === lastSavedValueRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setSaving(true);
        const res = await fetch(`/api/shifts/${shift.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ observations }),
        });
        if (!res.ok) throw new Error();
        lastSavedValueRef.current = observations;
        setSavedAt(Date.now());
      } catch {
        toast.error("No se pudo guardar la observación");
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [observations, open, shift.id]);

  // ─── Action helpers ────────────────────────────────────────────────────
  async function runAction(key: string, fn: () => Promise<void>) {
    setActionInFlight(key);
    try {
      await fn();
    } finally {
      setActionInFlight(null);
    }
  }

  async function markPasoAConsulta() {
    await runAction("paso", async () => {
      try {
        const res = await fetch(`/api/shifts/${shift.id}/start-consultation`, { method: "POST" });
        if (!res.ok) throw new Error();
        toast.success("Paciente pasó a consulta");
        onUpdated();
        onOpenChange(false);
      } catch {
        toast.error("No se pudo registrar el pasaje a consulta");
      }
    });
  }

  async function markAusente() {
    await runAction("ausente", async () => {
      try {
        const res = await fetch(`/api/shifts/${shift.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ABSENT" }),
        });
        if (!res.ok) throw new Error();
        toast.success("Paciente marcado como ausente");
        onUpdated();
        onOpenChange(false);
      } catch {
        toast.error("No se pudo marcar como ausente");
      }
    });
  }

  async function cancelarTurno() {
    if (!window.confirm("¿Cancelar el turno?")) return;
    await runAction("cancelar", async () => {
      try {
        const res = await fetch(`/api/shifts/${shift.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
        });
        if (!res.ok) throw new Error();
        toast.success("Turno cancelado");
        onUpdated();
        onOpenChange(false);
      } catch {
        toast.error("No se pudo cancelar el turno");
      }
    });
  }

  // ─── Derived data ──────────────────────────────────────────────────────
  const patient = shift.patient;
  const fullName = patient ? `${patient.lastName}, ${patient.firstName}` : "Paciente";
  const status = shift.status;
  const startStr = formatHHmm(shift.start);
  const endStr = formatHHmm(shift.end);
  const ctName = shift.consultationType?.name ?? "Consulta";
  const durationMin = useMemo(() => {
    return Math.max(
      0,
      Math.round((new Date(shift.end).getTime() - new Date(shift.start).getTime()) / 60000),
    );
  }, [shift.start, shift.end]);
  const medicName = shortMedic(shift.user);
  const medicColor = shift.user?.specialization?.color ?? "#0d4f4d";
  const age = calcAge(patient?.birthDate ?? null);
  const dni = formatDni(patient?.dni);
  const osLabel = patient?.os
    ? patient.osNumber
      ? `${patient.os.name} ${patient.osNumber}`
      : patient.os.name
    : null;

  const savedLabel = savedAt ? `✓ guardado ${relativeAgo(savedAt)}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 gap-0 overflow-hidden border-0 shadow-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Detalle de turno</DialogTitle>
        <DialogDescription className="sr-only">
          Información y acciones rápidas para el turno seleccionado.
        </DialogDescription>

        {/* Header */}
        <div className="flex items-start gap-3 border-b bg-card px-4 pt-4 pb-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold text-white"
            style={{ backgroundColor: medicColor }}
          >
            {patient ? initials(patient.firstName, patient.lastName) : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[15px] font-semibold text-foreground">{fullName}</span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[status]}`}
              >
                {STATUS_LABEL[status]}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {formatDateShort(shift.start)} · {startStr}–{endStr} · {ctName}{" "}
              <span className="text-muted-foreground/60">·</span>
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              {durationMin} min · {medicName}
              {shift.user?.defaultRoom ? ` · ${shift.user.defaultRoom}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Patient info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-b bg-muted/20 px-4 py-3 text-[12.5px]">
          <InfoRow Icon={IdCard} label="DNI" value={dni ?? "—"} />
          <InfoRow Icon={CreditCard} label="OBRA" value={osLabel ?? "—"} />
          <InfoRow
            Icon={Phone}
            label="TEL"
            value={patient?.telephone ?? "—"}
            href={patient?.telephone ? `tel:${patient.telephone.replace(/\s+/g, "")}` : undefined}
          />
          <InfoRow Icon={CalendarClock} label="EDAD" value={age !== null ? `${age} años` : "—"} />
        </div>

        {/* Last visit / next scheduled */}
        {(lastVisit || nextScheduled) && (
          <div className="flex items-start gap-2 border-b bg-card px-4 py-2.5 text-[12.5px]">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-muted-foreground">
              {lastVisit ? (
                <>
                  Última visita{" "}
                  <span className="font-medium text-foreground">{formatDateDMY(lastVisit.date)}</span>
                  {lastVisit.consultationTypeName ? (
                    <> ({lastVisit.consultationTypeName})</>
                  ) : null}
                </>
              ) : (
                <>Sin visitas previas</>
              )}
              {" · "}
              {nextScheduled ? (
                <>
                  próx. {formatDateDMY(nextScheduled.date)}
                  {nextScheduled.consultationTypeName ? <> ({nextScheduled.consultationTypeName})</> : null}
                </>
              ) : (
                <>sin próximo turno agendado</>
              )}
            </div>
            {patient?.id && onViewPatient && (
              <button
                type="button"
                onClick={() => onViewPatient(patient.id)}
                className="inline-flex shrink-0 items-center gap-0.5 text-[#0d4f4d] hover:underline"
              >
                Ver ficha
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Observations */}
        <div className="border-b bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <label htmlFor="obs" className="text-[12.5px] font-medium text-foreground">
              Observaciones
            </label>
            <span className="text-[11px] text-emerald-600 transition-opacity" aria-live="polite">
              {saving ? "guardando…" : savedLabel ?? ""}
            </span>
          </div>
          <textarea
            id="obs"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={3}
            placeholder="Ej: Holter 24 hs. Paciente reporta…"
            className="mt-1.5 w-full resize-none rounded-md border bg-card px-2.5 py-1.5 text-[13px] leading-snug placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/30"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se guarda automáticamente mientras escribís.
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 bg-card px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground transition hover:bg-muted"
              >
                Más opciones
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              <DropdownMenuItem
                onSelect={() => {
                  onOpenChange(false);
                  onReschedule?.(shift);
                }}
              >
                <CalendarClock className="mr-2 h-4 w-4" /> Reprogramar turno
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  toast.info("Recordatorio individual: próximamente");
                }}
              >
                <Mail className="mr-2 h-4 w-4" /> Enviar recordatorio
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={cancelarTurno}
                className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/30"
              >
                <XCircle className="mr-2 h-4 w-4" /> Cancelar turno
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={actionInFlight !== null || status === "ABSENT"}
              onClick={markAusente}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              {actionInFlight === "ausente" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserX className="h-3.5 w-3.5" />
              )}
              Ausente
            </button>
            <button
              type="button"
              disabled={
                actionInFlight !== null ||
                (primaryAction
                  ? !!primaryAction.disabled
                  : !!shift.consultationStartedAt)
              }
              onClick={() => (primaryAction ? primaryAction.onClick(shift) : markPasoAConsulta())}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {actionInFlight === "paso" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {primaryAction?.label ?? "Pasó a consulta"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  Icon,
  label,
  value,
  href,
}: {
  Icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {href ? (
          <a href={href} className="block truncate text-foreground hover:underline">
            {value}
          </a>
        ) : (
          <div className="truncate text-foreground">{value}</div>
        )}
      </div>
    </div>
  );
}
