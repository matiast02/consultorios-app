"use client";

import { Phone, Play, User } from "lucide-react";
import type { DashboardShift } from "@/types";

interface NextShiftCardProps {
  shift: DashboardShift | null;
  onStartConsultation: (shift: DashboardShift) => void;
  onViewPatient: (patientId: string) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minutesUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

function formatCountdown(mins: number): string {
  if (mins < 60) return `en ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `en ${h} h`;
  return `en ${h} h ${m} min`;
}

export function NextShiftCard({ shift, onStartConsultation, onViewPatient }: NextShiftCardProps) {
  if (!shift || !shift.patient) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          Próximo turno
        </div>
        <p className="mt-4 text-base font-medium text-muted-foreground">
          No hay próximos turnos por hoy
        </p>
        <p className="mt-1 text-sm text-muted-foreground/80">
          Cuando confirmes un turno, va a aparecer acá.
        </p>
      </div>
    );
  }

  const patientName = `${shift.patient.firstName} ${shift.patient.lastName}`;
  const osName = shift.patient.os?.name;
  const ctName = shift.consultationType?.name ?? "Consulta";
  const mins = minutesUntil(shift.start);

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 shadow-md ring-1 ring-black/5"
      style={{
        background:
          "linear-gradient(135deg, #0e5b58 0%, #0d4f4d 55%, #0a3f3d 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-12 -bottom-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"
      />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.7)]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/80">
              Próximo turno
            </span>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold leading-none text-white tabular-nums">
              {formatTime(shift.start)}
            </div>
            <div className="mt-1 text-xs text-emerald-100/70">{formatCountdown(mins)}</div>
          </div>
        </div>

        <div className="mt-3">
          <h2 className="text-2xl font-bold text-white">{patientName}</h2>
          <p className="mt-1 text-sm text-emerald-100/80">
            {ctName}
            {osName ? <> · {osName}</> : null}
            {shift.durationMinutes ? <> · {shift.durationMinutes} min</> : null}
          </p>
        </div>

        {shift.observations && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-sm">
            <p className="text-sm text-emerald-50/95">{shift.observations}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onStartConsultation(shift)}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#0d4f4d] shadow-sm transition hover:bg-emerald-50"
          >
            <Play className="h-4 w-4" />
            Iniciar consulta
          </button>
          <button
            type="button"
            onClick={() => shift.patient && onViewPatient(shift.patient.id)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/[0.12]"
          >
            <User className="h-4 w-4" />
            Ver ficha
          </button>
          {shift.patient.telephone && (
            <a
              href={`tel:${shift.patient.telephone.replace(/\s+/g, "")}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/[0.12]"
            >
              <Phone className="h-4 w-4" />
              Llamar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
