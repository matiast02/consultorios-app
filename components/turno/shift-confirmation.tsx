"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BellOff,
  CalendarDays,
  Check,
  Loader2,
  MapPin,
  RefreshCw,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatReminderDate, formatReminderTime } from "@/lib/reminders/message";
import type { PublicShiftConfirmation, ShiftStatus } from "@/types";

// Link público de confirmación de turno (/turno/<token>), sin login.
// Contrato: lib/openapi/paths/public.ts → /api/public/turno/{token}.
// Privacidad: solo se muestra lo que devuelve el endpoint (nombre de pila,
// fecha, hora, profesional, dirección y estado). Nada clínico.

type PatientAction = "confirm" | "cancel" | "opt_out";

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "error" }
  | { kind: "ready"; data: PublicShiftConfirmation };

type Notice = { tone: "error" | "info"; text: string };

const INVALID_TEXT = "Este enlace no es válido o ya venció. Comunicate con el consultorio.";
const LOCKED_TEXT =
  "Este turno ya no admite cambios desde el enlace. Si necesitás modificarlo, comunicate con el consultorio.";
// Los tokens son base64url (~32 caracteres); cualquier otra cosa no vale la pena consultarla.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

const STATUS_LABELS: Record<ShiftStatus, string> = {
  PENDING: "Pendiente de confirmación",
  CONFIRMED: "Confirmado",
  ABSENT: "Registrado como ausente",
  FINISHED: "Atendido",
  CANCELLED: "Cancelado",
};

const STATUS_STYLES: Record<ShiftStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-[var(--primary-soft)] text-[var(--primary-deep)] ring-[var(--primary-soft-2)]",
  ABSENT: "bg-slate-100 text-slate-700 ring-slate-200",
  FINISHED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-800 ring-rose-200",
};

const NOT_RESPONDABLE_TEXT: Record<ShiftStatus, string> = {
  PENDING: LOCKED_TEXT,
  CONFIRMED: LOCKED_TEXT,
  ABSENT: "La fecha de este turno ya pasó. Si necesitás un turno nuevo, comunicate con el consultorio.",
  FINISHED: "Este turno ya fue atendido. ¡Gracias por venir!",
  CANCELLED: "Este turno está cancelado. Si necesitás un turno nuevo, comunicate con el consultorio.",
};

function endpoint(token: string) {
  return `/api/public/turno/${encodeURIComponent(token)}`;
}

async function fetchShift(token: string, signal?: AbortSignal): Promise<LoadState> {
  if (!TOKEN_RE.test(token)) return { kind: "invalid" };
  try {
    const res = await fetch(endpoint(token), { cache: "no-store", signal });
    if (res.status === 404) return { kind: "invalid" };
    if (res.status === 429) return { kind: "rate_limited" };
    if (!res.ok) return { kind: "error" };
    const json = await res.json();
    if (!json?.success || !json.data) return { kind: "error" };
    return { kind: "ready", data: json.data as PublicShiftConfirmation };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { kind: "error" };
  }
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ─── UI building blocks ─────────────────────────────────────────────────────

const btnBase =
  "inline-flex w-full items-center justify-center gap-2 rounded-full font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary = cn(
  btnBase,
  "h-14 bg-[var(--primary)] text-[17px] text-white shadow-[0_8px_20px_rgba(10,138,158,0.28)] hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--primary-soft-2)]",
);
const btnOutline = cn(
  btnBase,
  "h-12 border border-[var(--border-strong)] bg-white text-[16px] text-[var(--ink-2)] hover:border-[var(--primary)] hover:text-[var(--primary-deep)] focus-visible:ring-[var(--primary-soft-2)]",
);
const btnDanger = cn(
  btnBase,
  "h-12 bg-rose-600 text-[16px] text-white shadow-[0_8px_20px_rgba(225,29,72,0.22)] hover:bg-rose-700 focus-visible:ring-rose-200",
);

function Shell({ clinicName, children, footer }: { clinicName?: string | null; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="landing min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6 sm:pt-12">
        <header className="mb-6 flex items-center gap-[11px]">
          <span
            aria-hidden
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] text-white"
            style={{
              background: "linear-gradient(150deg, var(--primary), var(--primary-deep))",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12), 0 6px 14px rgba(10,138,158,0.3)",
            }}
          >
            <Stethoscope className="h-[21px] w-[21px]" />
          </span>
          <div className="min-w-0 leading-tight">
            {clinicName ? (
              <p className="truncate text-[17px] font-bold tracking-tight text-[var(--ink)]">{clinicName}</p>
            ) : null}
            <p
              className={
                clinicName
                  ? "text-[13px] font-medium text-[var(--muted)]"
                  : "text-[15px] font-semibold text-[var(--ink-2)]"
              }
            >
              Recordatorio de turno
            </p>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        {footer ? <footer className="mt-8 space-y-3 text-center">{footer}</footer> : null}
      </main>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn("rounded-3xl border border-[var(--border)] bg-white p-6", className)}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {children}
    </section>
  );
}

function MessageState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <Panel className="text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-deep)]">
        {icon}
      </div>
      <h1 className="text-[22px] font-bold tracking-tight text-[var(--ink)]">{title}</h1>
      <p className="mt-2 text-[16px] text-[var(--ink-2)]">{text}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Panel>
  );
}

export function ShiftConfirmationSkeleton() {
  return (
    <Shell>
      <Panel>
        <div className="animate-pulse space-y-4" aria-hidden>
          <div className="h-7 w-2/3 rounded-lg bg-[var(--section-tint)]" />
          <div className="h-32 rounded-2xl bg-[var(--section-tint)]" />
          <div className="h-5 w-1/2 rounded bg-[var(--section-tint)]" />
          <div className="h-5 w-3/4 rounded bg-[var(--section-tint)]" />
          <div className="h-14 rounded-full bg-[var(--section-tint)]" />
        </div>
        <p className="sr-only" role="status">
          Cargando tu turno…
        </p>
      </Panel>
    </Shell>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ShiftConfirmation({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pending, setPending] = useState<PatientAction | null>(null);
  const [confirming, setConfirming] = useState<"cancel" | "opt_out" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [justDone, setJustDone] = useState<"confirm" | "cancel" | null>(null);
  const [optedOut, setOptedOut] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ kind: "loading" });
      try {
        setState(await fetchShift(token, signal));
      } catch {
        // abortado (desmontaje): no hacer nada
      }
    },
    [token],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  async function respond(action: PatientAction) {
    setPending(action);
    setNotice(null);
    try {
      const res = await fetch(endpoint(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        cache: "no-store",
      });
      if (res.status === 404) {
        setState({ kind: "invalid" });
        return;
      }
      if (res.status === 409) {
        setConfirming(null);
        setNotice({
          tone: "info",
          text:
            action === "opt_out"
              ? "No pudimos procesar el pedido desde este enlace. Comunicate con el consultorio."
              : LOCKED_TEXT,
        });
        const fresh = await fetchShift(token).catch(() => null);
        if (fresh?.kind === "ready") setState(fresh);
        return;
      }
      if (res.status === 429) {
        setNotice({ tone: "error", text: "Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo." });
        return;
      }
      if (!res.ok) throw new Error();
      const json = await res.json().catch(() => null);
      if (json?.data) setState({ kind: "ready", data: json.data as PublicShiftConfirmation });
      if (action === "opt_out") setOptedOut(true);
      else setJustDone(action);
      setConfirming(null);
    } catch {
      setNotice({
        tone: "error",
        text: "No pudimos registrar tu respuesta. Revisá tu conexión y probá de nuevo.",
      });
    } finally {
      setPending(null);
    }
  }

  if (state.kind === "loading") return <ShiftConfirmationSkeleton />;

  if (state.kind === "invalid") {
    return (
      <Shell>
        <MessageState
          icon={<AlertCircle className="h-7 w-7" />}
          title="Enlace no válido"
          text={INVALID_TEXT}
        />
      </Shell>
    );
  }

  if (state.kind === "rate_limited" || state.kind === "error") {
    return (
      <Shell>
        <MessageState
          icon={<AlertCircle className="h-7 w-7" />}
          title={state.kind === "rate_limited" ? "Demasiados intentos" : "No pudimos cargar tu turno"}
          text={
            state.kind === "rate_limited"
              ? "Esperá unos minutos y volvé a abrir el enlace."
              : "Revisá tu conexión a internet y probá de nuevo."
          }
          action={
            <button type="button" className={btnOutline} onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          }
        />
      </Shell>
    );
  }

  const d = state.data;
  const start = new Date(d.start);
  const validDate = !Number.isNaN(start.getTime());
  const isCancelled = d.response === "CANCELLED" || d.status === "CANCELLED";
  const isConfirmed = !isCancelled && d.response === "CONFIRMED";
  const busy = pending !== null;

  // ─── Área de respuesta ────────────────────────────────────────────────────
  let responseArea: ReactNode;
  if (confirming === "cancel") {
    responseArea = (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
        <h2 className="text-[18px] font-bold text-[var(--ink)]">¿Seguro que no podés ir?</h2>
        <p className="mt-1.5 text-[15px] text-[var(--ink-2)]">
          Vamos a cancelar tu turno y liberar el horario para que lo pueda usar otro paciente. Si después
          querés venir, vas a tener que pedir un turno nuevo.
        </p>
        <div className="mt-5 space-y-3">
          <button type="button" className={btnDanger} disabled={busy} onClick={() => void respond("cancel")}>
            {pending === "cancel" ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
            Sí, cancelar mi turno
          </button>
          <button
            type="button"
            className={btnOutline}
            disabled={busy}
            autoFocus
            onClick={() => setConfirming(null)}
          >
            Volver
          </button>
        </div>
      </div>
    );
  } else if (isCancelled) {
    responseArea = (
      <div className="rounded-2xl bg-rose-50 p-5 text-center ring-1 ring-rose-200">
        <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-rose-100 text-rose-700">
          <X className="h-6 w-6" />
        </div>
        <p className="text-[19px] font-bold text-rose-800">Turno cancelado</p>
        <p className="mt-1 text-[15px] text-[var(--ink-2)]">
          {justDone === "cancel"
            ? "Listo, liberamos el horario. Gracias por avisarnos."
            : "Este turno ya está cancelado."}{" "}
          Si querés un turno nuevo, comunicate con el consultorio.
        </p>
      </div>
    );
  } else if (isConfirmed) {
    responseArea = (
      <div className="space-y-3">
        <div className="rounded-2xl bg-[var(--primary-soft)] p-5 text-center ring-1 ring-[var(--primary-soft-2)]">
          <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-[var(--primary)] text-white">
            <Check className="h-6 w-6" />
          </div>
          <p className="text-[19px] font-bold text-[var(--primary-deep)]">Turno confirmado ✓</p>
          <p className="mt-1 text-[15px] text-[var(--ink-2)]">
            {justDone === "confirm" ? "¡Gracias por confirmar! Te esperamos." : "¡Te esperamos!"}
          </p>
        </div>
        {d.canRespond && (
          <button
            type="button"
            className="w-full py-2 text-[14.5px] font-medium text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink-2)]"
            onClick={() => setConfirming("cancel")}
          >
            ¿Al final no podés ir? Avisanos
          </button>
        )}
      </div>
    );
  } else if (d.canRespond) {
    responseArea = (
      <div className="space-y-3">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void respond("confirm")}>
          {pending === "confirm" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          Confirmar asistencia
        </button>
        <button type="button" className={btnOutline} disabled={busy} onClick={() => setConfirming("cancel")}>
          No puedo ir
        </button>
      </div>
    );
  } else {
    responseArea = (
      <div className="rounded-2xl bg-[var(--surface-2)] p-5 text-center text-[15px] text-[var(--ink-2)] ring-1 ring-[var(--border)]">
        {NOT_RESPONDABLE_TEXT[d.status] ?? LOCKED_TEXT}
      </div>
    );
  }

  // ─── Pie: opt-out de recordatorios ────────────────────────────────────────
  let optOutArea: ReactNode;
  if (optedOut) {
    optOutArea = (
      <p className="flex items-start justify-center gap-2 text-[14px] text-[var(--ink-2)]" role="status">
        <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
        Listo. No vas a recibir más recordatorios de turnos. Si cambiás de idea, avisale al consultorio.
      </p>
    );
  } else if (confirming === "opt_out") {
    optOutArea = (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 text-left">
        <h2 className="text-[16px] font-bold text-[var(--ink)]">¿Dejar de recibir recordatorios?</h2>
        <p className="mt-1.5 text-[14.5px] text-[var(--ink-2)]">
          No vas a recibir más avisos de tus próximos turnos por email ni WhatsApp. Este turno no se modifica.
        </p>
        <div className="mt-4 space-y-2.5">
          <button
            type="button"
            className={cn(btnOutline, "h-11 text-[15px]")}
            disabled={busy}
            onClick={() => void respond("opt_out")}
          >
            {pending === "opt_out" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
            Sí, no quiero recibirlos
          </button>
          <button
            type="button"
            className="w-full py-1.5 text-[14px] font-medium text-[var(--muted)] hover:text-[var(--ink-2)]"
            disabled={busy}
            autoFocus
            onClick={() => setConfirming(null)}
          >
            Volver
          </button>
        </div>
      </div>
    );
  } else {
    optOutArea = (
      <button
        type="button"
        className="text-[13px] text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink-2)]"
        onClick={() => {
          setNotice(null);
          setConfirming("opt_out");
        }}
      >
        No quiero recibir más recordatorios
      </button>
    );
  }

  return (
    <Shell
      clinicName={d.clinicName}
      footer={
        <>
          {optOutArea}
          <p className="text-[12px] text-[var(--muted-2)]">
            Por tu privacidad, esta página muestra solo los datos básicos de tu turno.
          </p>
        </>
      }
    >
      <Panel>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
          Hola {d.patientFirstName}
        </h1>
        <p className="mt-1 text-[16px] text-[var(--muted)]">
          {isCancelled ? "Estos son los datos del turno:" : "Estos son los datos de tu turno:"}
        </p>

        {/* Fecha y hora */}
        <div className="mt-5 rounded-2xl bg-[var(--section-tint)] px-5 py-4">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--primary-deep)]">
            <CalendarDays className="h-[18px] w-[18px]" />
            {validDate ? capitalize(formatReminderDate(start)) : "—"}
          </div>
          <p className="mt-1 leading-none">
            <span
              className={cn(
                "font-mono-display text-[52px] font-medium tracking-tight tabular-nums text-[var(--ink)]",
                isCancelled && "text-[var(--muted)] line-through decoration-2",
              )}
            >
              {validDate ? formatReminderTime(start) : "—"}
            </span>
            <span className="ml-1.5 text-[18px] font-semibold text-[var(--muted)]">hs</span>
          </p>
        </div>

        {/* Detalle */}
        <dl className="mt-5 space-y-3.5 text-[15.5px]">
          <div className="flex items-start gap-3">
            <dt className="sr-only">Profesional</dt>
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
            <dd className="font-medium text-[var(--ink)]">{d.medicShortName}</dd>
          </div>
          {d.address && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Dirección</dt>
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
              <dd className="text-[var(--ink-2)]">{d.address}</dd>
            </div>
          )}
          <div className="flex items-center gap-3">
            <dt className="sr-only">Estado</dt>
            <span aria-hidden className="h-5 w-5 shrink-0" />
            <dd>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold ring-1",
                  STATUS_STYLES[d.status] ?? STATUS_STYLES.PENDING,
                )}
              >
                {STATUS_LABELS[d.status] ?? d.status}
              </span>
            </dd>
          </div>
        </dl>

        <div className="mt-6" aria-live="polite">
          {notice && (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={cn(
                "mb-4 rounded-xl px-4 py-3 text-[14.5px]",
                notice.tone === "error"
                  ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
              )}
            >
              {notice.text}
            </p>
          )}
          {responseArea}
        </div>
      </Panel>
    </Shell>
  );
}
