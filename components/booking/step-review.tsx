"use client";

import { CalendarDays, Info, Loader2, Stethoscope, UserRound } from "lucide-react";
import { formatDateOnlyLong, type BookingPatientValues } from "@/lib/booking-client";
import type { SelectedSlot } from "./booking-storage";
import { Notice, Panel, StickyActions, btnPrimary } from "./public-ui";

interface StepReviewProps {
  medicShortName: string;
  specialtyName: string | null;
  consultationTypeName: string | null;
  slot: SelectedSlot;
  patient: BookingPatientValues;
  clinicNotes: string | null;
  submitting: boolean;
  error: string | null;
  onEditProfessional: () => void;
  onEditSlot: () => void;
  onEditPatient: () => void;
  onSubmit: () => void;
}

const editBtn =
  "shrink-0 rounded-full px-2 py-0.5 text-[13.5px] font-semibold text-[var(--primary-deep)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-soft-2)]";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[14px] text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[15px] font-medium text-[var(--ink)]">{value}</dd>
    </div>
  );
}

export function StepReview({
  medicShortName,
  specialtyName,
  consultationTypeName,
  slot,
  patient,
  clinicNotes,
  submitting,
  error,
  onEditProfessional,
  onEditSlot,
  onEditPatient,
  onSubmit,
}: StepReviewProps) {
  return (
    <>
      <Panel>
        <h1
          id="booking-step-title"
          tabIndex={-1}
          className="text-[24px] font-bold leading-tight tracking-tight text-[var(--ink)] outline-none"
        >
          Revisá y confirmá
        </h1>
        <p className="mt-1 text-[15.5px] text-[var(--muted)]">
          Todavía no está enviada: tocá <strong className="text-[var(--ink-2)]">Reservar</strong> para mandar la
          solicitud.
        </p>

        {/* Turno */}
        <div className="mt-5 rounded-2xl bg-[var(--section-tint)] px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--primary-deep)]">
              <CalendarDays className="h-[18px] w-[18px]" aria-hidden />
              {formatDateOnlyLong(slot.date)}
            </p>
            <button type="button" className={editBtn} onClick={onEditSlot} disabled={submitting}>
              Cambiar
            </button>
          </div>
          <p className="mt-1 leading-none">
            <span className="font-mono-display text-[46px] font-medium tracking-tight tabular-nums text-[var(--ink)]">
              {slot.time}
            </span>
            <span className="ml-1.5 text-[18px] font-semibold text-[var(--muted)]">hs</span>
          </p>
          <div className="mt-3 flex items-start justify-between gap-2 border-t border-[var(--border-strong)]/60 pt-3">
            <div className="min-w-0 space-y-1 text-[15px]">
              <p className="flex items-center gap-2 font-medium text-[var(--ink)]">
                <UserRound className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                <span className="truncate">{medicShortName}</span>
              </p>
              {(specialtyName || consultationTypeName) && (
                <p className="flex items-center gap-2 text-[var(--ink-2)]">
                  <Stethoscope className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                  <span className="truncate">{[specialtyName, consultationTypeName].filter(Boolean).join(" · ")}</span>
                </p>
              )}
            </div>
            <button type="button" className={editBtn} onClick={onEditProfessional} disabled={submitting}>
              Cambiar
            </button>
          </div>
        </div>

        {/* Datos */}
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-bold text-[var(--ink)]">Tus datos</h2>
            <button type="button" className={editBtn} onClick={onEditPatient} disabled={submitting}>
              Editar
            </button>
          </div>
          <dl className="mt-1 divide-y divide-[var(--border)]">
            <Row label="Nombre" value={`${patient.firstName} ${patient.lastName}`.trim()} />
            <Row label="DNI" value={patient.dni} />
            <Row label="Celular" value={patient.phone} />
            {patient.email && <Row label="Email" value={patient.email} />}
            {patient.healthInsurance && <Row label="Obra social" value={patient.healthInsurance} />}
          </dl>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[14px] text-[var(--ink-2)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
          Es una solicitud: recepción la confirma y te avisa. Si ya sos paciente, no cambiamos los datos de tu
          ficha.
        </p>

        {clinicNotes && (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[14.5px] text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">Aviso del consultorio</p>
            <p className="mt-0.5 whitespace-pre-line">{clinicNotes}</p>
          </div>
        )}

        {error && (
          <div className="mt-5" aria-live="assertive">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </Panel>

      <StickyActions>
        <button type="button" className={btnPrimary} disabled={submitting} onClick={onSubmit}>
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {submitting ? "Reservando…" : "Reservar"}
        </button>
      </StickyActions>
    </>
  );
}
