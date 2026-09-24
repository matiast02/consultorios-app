"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarX, ChevronLeft, ChevronRight, RefreshCw, Sunrise, Sunset } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addDaysISO,
  dayPillParts,
  diffDaysISO,
  formatDateOnlyLong,
  formatWeekRange,
  isIsoDate,
  isMorning,
  isPast,
  maxISO,
} from "@/lib/booking-client";
import type { PublicAvailabilityDay } from "@/types";
import type { SelectedSlot } from "./booking-storage";
import { Notice, Panel, StickyActions, btnOutline, btnPrimary } from "./public-ui";

// Paso 2: GET /api/public/booking/availability?medicId=&from=&days=&consultationTypeId=
// Solo horarios libres (nunca datos de otros pacientes).

type AvailabilityState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "rate_limited" }
  | { kind: "ready"; days: PublicAvailabilityDay[]; durationMinutes: number | null };

interface StepSlotProps {
  medicId: string;
  consultationTypeId: string | null;
  /** Primer día reservable (hoy, hora AR). */
  minDate: string;
  /** Último día reservable (hoy + maxDaysAhead). */
  maxDate: string;
  weekFrom: string;
  onWeekChange: (from: string) => void;
  slot: SelectedSlot | null;
  onSelectSlot: (slot: SelectedSlot | null) => void;
  onContinue: () => void;
  notice: string | null;
  /** Cambia para forzar una recarga (p. ej. después de un 409 SLOT_TAKEN). */
  reloadKey: number;
  /** 404: el profesional ya no toma reservas online. */
  onUnavailable: () => void;
  /** 503: el módulo se deshabilitó. */
  onDisabled: () => void;
  onDuration: (minutes: number | null) => void;
  summary: ReactNode;
  contactAction: ReactNode;
}

export function StepSlot({
  medicId,
  consultationTypeId,
  minDate,
  maxDate,
  weekFrom,
  onWeekChange,
  slot,
  onSelectSlot,
  onContinue,
  notice,
  reloadKey,
  onUnavailable,
  onDisabled,
  onDuration,
  summary,
  contactAction,
}: StepSlotProps) {
  const [state, setState] = useState<AvailabilityState>({ kind: "loading" });
  const [pickedDate, setPickedDate] = useState<string | null>(slot?.date ?? null);
  const [retry, setRetry] = useState(0);

  const dayCount = Math.max(1, Math.min(7, diffDaysISO(weekFrom, maxDate) + 1));
  const weekTo = addDaysISO(weekFrom, dayCount - 1);
  const canPrev = weekFrom > minDate;
  const nextFrom = addDaysISO(weekFrom, 7);
  const canNext = nextFrom <= maxDate;

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: "loading" });
    const qs = new URLSearchParams({ medicId, from: weekFrom, days: String(dayCount) });
    if (consultationTypeId) qs.set("consultationTypeId", consultationTypeId);
    fetch(`/api/public/booking/availability?${qs.toString()}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 404) return onUnavailable();
        if (res.status === 503) return onDisabled();
        if (res.status === 429) return setState({ kind: "rate_limited" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        const data = json?.data;
        if (!json?.success || !Array.isArray(data?.days)) throw new Error("payload");
        const now = Date.now();
        const days: PublicAvailabilityDay[] = (data.days as PublicAvailabilityDay[])
          .filter((d) => isIsoDate(d?.date))
          .map((d) => ({
            date: d.date,
            closed: !!d.closed,
            slots: Array.isArray(d.slots)
              ? d.slots.filter(
                  (s) => typeof s?.start === "string" && typeof s?.time === "string" && !isPast(s.start, 0, now),
                )
              : [],
          }));
        const duration = typeof data.durationMinutes === "number" ? data.durationMinutes : null;
        onDuration(duration);
        setState({ kind: "ready", days, durationMinutes: duration });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "error" });
      });
    return () => ctrl.abort();
  }, [medicId, consultationTypeId, weekFrom, dayCount, reloadKey, retry, onUnavailable, onDisabled, onDuration]);

  const days = state.kind === "ready" ? state.days : null;

  // Día visible: el elegido si tiene horarios; si no, el primero con horarios.
  const activeDate = useMemo(() => {
    if (!days) return null;
    const open = days.filter((d) => !d.closed && d.slots.length > 0);
    if (pickedDate && open.some((d) => d.date === pickedDate)) return pickedDate;
    return open[0]?.date ?? null;
  }, [days, pickedDate]);

  // Si el horario elegido ya no figura (lo tomó otra persona), se descarta.
  useEffect(() => {
    if (!days || !slot) return;
    if (slot.date < weekFrom || slot.date > weekTo) return;
    const stillFree = days.some((d) => d.date === slot.date && d.slots.some((s) => s.start === slot.start));
    if (!stillFree) onSelectSlot(null);
  }, [days, slot, weekFrom, weekTo, onSelectSlot]);

  const activeDay = days?.find((d) => d.date === activeDate) ?? null;
  const groups = useMemo(() => {
    if (!activeDay) return [];
    return [
      { key: "am", label: "Mañana", icon: Sunrise, slots: activeDay.slots.filter((s) => isMorning(s.time)) },
      { key: "pm", label: "Tarde", icon: Sunset, slots: activeDay.slots.filter((s) => !isMorning(s.time)) },
    ].filter((g) => g.slots.length > 0);
  }, [activeDay]);

  const roundBtn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-white text-[var(--ink-2)] transition hover:border-[var(--primary)] hover:text-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft-2)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <>
      <Panel>
        <h1
          id="booking-step-title"
          tabIndex={-1}
          className="text-[24px] font-bold leading-tight tracking-tight text-[var(--ink)] outline-none"
        >
          Elegí día y horario
        </h1>
        <div className="mt-4">{summary}</div>

        {notice && (
          <div className="mt-4">
            <Notice tone="info">{notice}</Notice>
          </div>
        )}

        {/* Navegación semanal */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            className={roundBtn}
            aria-label="Semana anterior"
            disabled={!canPrev || state.kind === "loading"}
            onClick={() => onWeekChange(maxISO(minDate, addDaysISO(weekFrom, -7)))}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="text-center text-[15.5px] font-semibold text-[var(--ink)]" aria-live="polite">
            {formatWeekRange(weekFrom, weekTo)}
          </p>
          <button
            type="button"
            className={roundBtn}
            aria-label="Semana siguiente"
            disabled={!canNext || state.kind === "loading"}
            onClick={() => onWeekChange(nextFrom)}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {state.kind === "loading" && (
          <div aria-hidden className="mt-4 animate-pulse">
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="h-[74px] rounded-2xl bg-[var(--section-tint)]" />
              ))}
            </div>
            <div className="mt-6 h-4 w-1/2 rounded bg-[var(--section-tint)]" />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-11 rounded-xl bg-[var(--section-tint)]" />
              ))}
            </div>
          </div>
        )}
        {state.kind === "loading" && (
          <p className="sr-only" role="status">
            Buscando horarios libres…
          </p>
        )}

        {(state.kind === "error" || state.kind === "rate_limited") && (
          <div className="mt-5 space-y-3">
            <Notice tone="error">
              {state.kind === "rate_limited"
                ? "Hiciste muchas consultas seguidas. Esperá unos minutos y probá de nuevo."
                : "No pudimos cargar los horarios. Revisá tu conexión y probá de nuevo."}
            </Notice>
            <button type="button" className={btnOutline} onClick={() => setRetry((n) => n + 1)}>
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        )}

        {days && (
          <>
            <div role="radiogroup" aria-label="Día" className="mt-4 grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const parts = dayPillParts(d.date);
                const count = d.closed ? 0 : d.slots.length;
                const selected = d.date === activeDate;
                const label = `${formatDateOnlyLong(d.date)}: ${
                  d.closed ? "no atiende" : count === 0 ? "sin horarios libres" : `${count} horarios libres`
                }`;
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    title={label}
                    disabled={count === 0}
                    onClick={() => setPickedDate(d.date)}
                    className={cn(
                      "flex min-w-0 flex-col items-center rounded-2xl border px-0.5 py-2 leading-tight transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft-2)]",
                      selected
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[0_6px_16px_rgba(10,138,158,0.28)]"
                        : count > 0
                          ? "border-[var(--border-strong)] bg-white text-[var(--ink)] hover:border-[var(--primary)]"
                          : "cursor-not-allowed border-dashed border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-2)]",
                    )}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide">{parts.weekday}</span>
                    <span className="text-[19px] font-bold tabular-nums">{parts.day}</span>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 h-1.5 w-1.5 rounded-full",
                        count === 0 ? "bg-transparent" : selected ? "bg-white" : "bg-[var(--primary)]",
                      )}
                    />
                  </button>
                );
              })}
            </div>

            {activeDay ? (
              <div className="mt-6">
                <h2 className="text-[16px] font-bold text-[var(--ink)]">{formatDateOnlyLong(activeDay.date)}</h2>
                {state.kind === "ready" && state.durationMinutes ? (
                  <p className="text-[13.5px] text-[var(--muted)]">{`Turnos de ${state.durationMinutes} min`}</p>
                ) : null}
                {groups.map((g) => {
                  const Icon = g.icon;
                  return (
                    <div key={g.key} className="mt-4">
                      <p
                        id={`slots-${g.key}`}
                        className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]"
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {g.label}
                      </p>
                      <div
                        role="radiogroup"
                        aria-labelledby={`slots-${g.key}`}
                        className="grid grid-cols-4 gap-2 sm:grid-cols-5"
                      >
                        {g.slots.map((s) => {
                          const selected = slot?.start === s.start;
                          return (
                            <button
                              key={s.start}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${s.time} horas`}
                              onClick={() => onSelectSlot({ date: activeDay.date, start: s.start, time: s.time })}
                              className={cn(
                                "h-11 rounded-xl border text-[15.5px] font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft-2)]",
                                selected
                                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                  : "border-[var(--border-strong)] bg-white text-[var(--ink)] hover:border-[var(--primary)] hover:text-[var(--primary-deep)]",
                              )}
                            >
                              {s.time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl bg-[var(--surface-2)] p-5 text-center ring-1 ring-[var(--border)]">
                <CalendarX className="mx-auto h-7 w-7 text-[var(--muted)]" aria-hidden />
                <p className="mt-2 text-[16.5px] font-semibold text-[var(--ink)]">No quedan horarios esta semana</p>
                <p className="mt-1 text-[14.5px] text-[var(--muted)]">
                  {canNext
                    ? "Probá con la semana siguiente."
                    : "No hay más horarios para reservar online por ahora. Escribinos y te ayudamos a coordinar."}
                </p>
                <div className="mt-4 space-y-2.5">
                  {canNext ? (
                    <button type="button" className={btnOutline} onClick={() => onWeekChange(nextFrom)}>
                      Ver semana siguiente
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    contactAction
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      <StickyActions>
        {slot && (
          <p className="mb-2 text-center text-[14.5px] text-[var(--ink-2)]" aria-live="polite">
            {formatDateOnlyLong(slot.date)} · <strong className="text-[var(--ink)]">{`${slot.time} hs`}</strong>
          </p>
        )}
        <button type="button" className={btnPrimary} disabled={!slot} onClick={onContinue}>
          Continuar
        </button>
      </StickyActions>
    </>
  );
}
