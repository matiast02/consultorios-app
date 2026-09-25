"use client";

import type { ReactNode } from "react";
import { Check, Clock, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicBookingConfig } from "@/types";
import { MedicAvatar, Notice, Panel, StickyActions, btnPrimary } from "./public-ui";

interface StepProfessionalProps {
  config: PublicBookingConfig;
  medicId: string | null;
  consultationTypeId: string | null;
  notice: string | null;
  onSelectMedic: (medicId: string) => void;
  onSelectType: (consultationTypeId: string | null) => void;
  onContinue: () => void;
}

export function StepProfessional({
  config,
  medicId,
  consultationTypeId,
  notice,
  onSelectMedic,
  onSelectType,
  onContinue,
}: StepProfessionalProps) {
  const specialties = config.specialties.filter((s) => s.medics.length > 0);
  const types = config.consultationTypes;

  return (
    <>
      <Panel>
        <h1
          id="booking-step-title"
          tabIndex={-1}
          className="text-[24px] font-bold leading-tight tracking-tight text-[var(--ink)] outline-none"
        >
          ¿Con quién querés atenderte?
        </h1>
        <p className="mt-1 text-[15.5px] text-[var(--muted)]">
          Elegí el profesional y después vas a ver sus horarios libres.
        </p>

        {notice && (
          <div className="mt-4">
            <Notice tone="info">{notice}</Notice>
          </div>
        )}

        <div className="mt-5 space-y-6">
          {specialties.map((s) => (
            <section key={s.id} aria-labelledby={`esp-${s.id}`}>
              <h2
                id={`esp-${s.id}`}
                className="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]"
              >
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color || "var(--primary)" }} />
                {s.name}
              </h2>
              <ul role="radiogroup" aria-labelledby={`esp-${s.id}`} className="space-y-2">
                {s.medics.map((m) => {
                  const selected = m.id === medicId;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onSelectMedic(m.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft-2)]",
                          selected
                            ? "border-[var(--primary)] bg-[var(--primary-soft)] ring-1 ring-[var(--primary)]"
                            : "border-[var(--border)] bg-white hover:border-[var(--primary)]",
                        )}
                      >
                        <MedicAvatar shortName={m.shortName} color={s.color} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16.5px] font-semibold text-[var(--ink)]">
                            {m.shortName}
                          </span>
                          <span className="flex items-center gap-1 text-[13.5px] text-[var(--muted)]">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            Turnos de {m.slotDurationMinutes} min
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition",
                            selected
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--border-strong)] bg-white text-transparent",
                          )}
                        >
                          <Check className="h-4 w-4" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {medicId && types.length > 0 && (
          <section aria-labelledby="booking-type" className="mt-7 border-t border-[var(--border)] pt-5">
            <h2 id="booking-type" className="text-[16px] font-bold text-[var(--ink)]">
              Tipo de consulta <span className="text-[13.5px] font-medium text-[var(--muted)]">(opcional)</span>
            </h2>
            <p className="mt-0.5 text-[14px] text-[var(--muted)]">
              Si no sabés cuál elegir, dejalo así: el consultorio lo ajusta.
            </p>
            <div role="radiogroup" aria-labelledby="booking-type" className="mt-3 flex flex-wrap gap-2">
              <TypeChip selected={consultationTypeId === null} onClick={() => onSelectType(null)}>
                <UserRound className="h-4 w-4" aria-hidden />
                No sé / consulta
              </TypeChip>
              {types.map((t) => {
                const selected = consultationTypeId === t.id;
                return (
                  <TypeChip key={t.id} selected={selected} onClick={() => onSelectType(t.id)}>
                    {t.name}
                    <span className={cn("text-[12.5px]", selected ? "text-white/80" : "text-[var(--muted)]")}>
                      {`· ${t.durationMinutes} min`}
                    </span>
                  </TypeChip>
                );
              })}
            </div>
          </section>
        )}
      </Panel>

      <StickyActions>
        <button type="button" className={btnPrimary} disabled={!medicId} onClick={onContinue}>
          Ver horarios
        </button>
      </StickyActions>
    </>
  );
}

function TypeChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[14.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft-2)]",
        selected
          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
          : "border-[var(--border-strong)] bg-white text-[var(--ink-2)] hover:border-[var(--primary)]",
      )}
    >
      {children}
    </button>
  );
}
