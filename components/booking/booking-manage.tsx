"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, CalendarDays, Check, Clock, Loader2, MapPin, RefreshCw, Stethoscope, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MANAGE_TOKEN_RE, formatBookingDate, formatBookingTime } from "@/lib/booking-client";
import { ONLINE_BOOKING_STATUS_LABELS, type OnlineBookingStatus, type PublicBookingView } from "@/types";
import {
  MessageState,
  Notice,
  Panel,
  PanelSkeleton,
  PublicShell,
  btnDanger,
  btnOutline,
  btnPrimary,
  linkMuted,
  linkMutedStyle,
} from "./public-ui";

// Link de gestión de una reserva online (/reserva/<token>), sin login.
// Contrato: lib/openapi/paths/public.ts → /api/public/booking/{token}.
// Solo muestra lo que devuelve el endpoint (nombre de pila, fecha, hora,
// profesional, tipo de consulta, dirección y estado). Nada clínico.

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "error" }
  | { kind: "ready"; data: PublicBookingView };

const SUBTITLE = "Tu reserva online";
const INVALID_TEXT = "Este enlace no es válido o ya venció. Si necesitás ayuda, comunicate con el consultorio.";
const LOCKED_TEXT =
  "Esta reserva ya no se puede cancelar desde el enlace. Si necesitás cambiarla, comunicate con el consultorio.";

const STATUS_STYLES: Record<OnlineBookingStatus, string> = {
  PENDING_CONFIRMATION: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-[var(--primary-soft)] text-[var(--primary-deep)] ring-[var(--primary-soft-2)]",
  CANCELLED: "bg-rose-50 text-rose-800 ring-rose-200",
  EXPIRED: "bg-slate-100 text-slate-700 ring-slate-200",
};

const STATUS_TEXT: Record<OnlineBookingStatus, string> = {
  PENDING_CONFIRMATION: "Recepción todavía tiene que confirmar tu turno. Te avisamos por teléfono o email.",
  CONFIRMED: "¡Tu turno está confirmado! Te esperamos.",
  CANCELLED: "Esta reserva está cancelada. Si necesitás un turno, podés pedir uno nuevo.",
  EXPIRED: "Esta reserva ya venció. Si necesitás un turno, podés pedir uno nuevo.",
};

function endpoint(token: string) {
  return `/api/public/booking/${encodeURIComponent(token)}`;
}

async function fetchBooking(token: string, signal?: AbortSignal): Promise<LoadState> {
  if (!MANAGE_TOKEN_RE.test(token)) return { kind: "invalid" };
  try {
    const res = await fetch(endpoint(token), { cache: "no-store", signal });
    if (res.status === 404) return { kind: "invalid" };
    if (res.status === 429) return { kind: "rate_limited" };
    if (!res.ok) return { kind: "error" };
    const json = await res.json().catch(() => null);
    if (!json?.success || !json.data) return { kind: "error" };
    return { kind: "ready", data: json.data as PublicBookingView };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { kind: "error" };
  }
}

export function BookingManageSkeleton() {
  return (
    <PublicShell subtitle={SUBTITLE}>
      <PanelSkeleton label="Cargando tu reserva…" />
    </PublicShell>
  );
}

export function BookingManage({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ kind: "loading" });
      try {
        setState(await fetchBooking(token, signal));
      } catch {
        // abortado (desmontaje)
      }
    },
    [token],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  async function cancel() {
    setCancelling(true);
    setNotice(null);
    try {
      const res = await fetch(endpoint(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
        cache: "no-store",
      });
      if (res.status === 404) {
        setState({ kind: "invalid" });
        return;
      }
      if (res.status === 409) {
        setConfirming(false);
        setNotice({ tone: "info", text: LOCKED_TEXT });
        const fresh = await fetchBooking(token).catch(() => null);
        if (fresh?.kind === "ready") setState(fresh);
        return;
      }
      if (res.status === 429) {
        setNotice({ tone: "error", text: "Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo." });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json().catch(() => null);
      const updated = json?.data as Partial<PublicBookingView> | undefined;
      setState((prev) =>
        prev.kind === "ready"
          ? {
              kind: "ready",
              data: {
                ...prev.data,
                ...(updated && typeof updated.status === "string" ? updated : {}),
                status: "CANCELLED",
                canCancel: false,
              },
            }
          : prev,
      );
      setJustCancelled(true);
      setConfirming(false);
    } catch {
      setNotice({ tone: "error", text: "No pudimos cancelar la reserva. Revisá tu conexión y probá de nuevo." });
    } finally {
      setCancelling(false);
    }
  }

  if (state.kind === "loading") return <BookingManageSkeleton />;

  if (state.kind === "invalid") {
    return (
      <PublicShell subtitle={SUBTITLE} footer={<NewBookingLink />}>
        <MessageState tone="warning" icon={<AlertCircle className="h-7 w-7" />} title="Enlace no válido" text={INVALID_TEXT} />
      </PublicShell>
    );
  }

  if (state.kind === "rate_limited" || state.kind === "error") {
    return (
      <PublicShell subtitle={SUBTITLE}>
        <MessageState
          tone="danger"
          icon={<AlertCircle className="h-7 w-7" />}
          title={state.kind === "rate_limited" ? "Demasiados intentos" : "No pudimos cargar tu reserva"}
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
      </PublicShell>
    );
  }

  const d = state.data;
  const status: OnlineBookingStatus = d.status in ONLINE_BOOKING_STATUS_LABELS ? d.status : "PENDING_CONFIRMATION";
  const isCancelled = status === "CANCELLED";
  const isClosed = isCancelled || status === "EXPIRED";

  let actionArea: ReactNode = null;
  if (confirming) {
    actionArea = (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
        <h2 className="text-[18px] font-bold text-[var(--ink)]">¿Cancelar la reserva?</h2>
        <p className="mt-1.5 text-[15px] text-[var(--ink-2)]">
          Vamos a liberar el horario para que lo pueda usar otra persona. Si después querés venir, vas a tener que
          pedir un turno nuevo.
        </p>
        <div className="mt-5 space-y-3">
          <button type="button" className={btnDanger} disabled={cancelling} onClick={() => void cancel()}>
            {cancelling ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
            Sí, cancelar mi reserva
          </button>
          <button
            type="button"
            className={btnOutline}
            disabled={cancelling}
            autoFocus
            onClick={() => setConfirming(false)}
          >
            Volver
          </button>
        </div>
      </div>
    );
  } else if (isCancelled) {
    actionArea = (
      <div className="rounded-2xl bg-rose-50 p-5 text-center ring-1 ring-rose-200">
        <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-rose-100 text-rose-700">
          <X className="h-6 w-6" />
        </div>
        <p className="text-[19px] font-bold text-rose-800">Reserva cancelada</p>
        <p className="mt-1 text-[15px] text-[var(--ink-2)]">
          {justCancelled
            ? "Listo, liberamos el horario. Gracias por avisarnos."
            : "Esta reserva ya está cancelada."}
        </p>
      </div>
    );
  } else if (d.canCancel) {
    actionArea = (
      <div className="space-y-3">
        <p
          className={cn(
            "flex items-start gap-2 rounded-2xl p-4 text-[15px] ring-1",
            status === "CONFIRMED"
              ? "bg-[var(--primary-soft)] text-[var(--primary-deep)] ring-[var(--primary-soft-2)]"
              : "bg-[var(--surface-2)] text-[var(--ink-2)] ring-[var(--border)]",
          )}
        >
          {status === "CONFIRMED" ? (
            <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          )}
          {STATUS_TEXT[status]}
        </p>
        <button
          type="button"
          className={btnOutline}
          onClick={() => {
            setNotice(null);
            setConfirming(true);
          }}
        >
          Cancelar reserva
        </button>
      </div>
    );
  } else {
    actionArea = (
      <div className="rounded-2xl bg-[var(--surface-2)] p-5 text-center text-[15px] text-[var(--ink-2)] ring-1 ring-[var(--border)]">
        {isClosed ? STATUS_TEXT[status] : `${STATUS_TEXT[status]} ${LOCKED_TEXT}`}
      </div>
    );
  }

  return (
    <PublicShell
      clinicName={d.clinicName}
      subtitle={SUBTITLE}
      footer={
        <>
          {isClosed && <NewBookingLink primary />}
          <p className="text-[12px] text-[var(--muted-2)]">
            Por tu privacidad, esta página muestra solo los datos básicos de tu reserva.
          </p>
        </>
      }
    >
      <Panel>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
          Hola {d.patientFirstName}
        </h1>
        <p className="mt-1 text-[16px] text-[var(--muted)]">Estos son los datos de tu reserva:</p>

        <div className="mt-5 rounded-2xl bg-[var(--section-tint)] px-5 py-4">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--primary-deep)]">
            <CalendarDays className="h-[18px] w-[18px]" aria-hidden />
            {formatBookingDate(d.start)}
          </div>
          <p className="mt-1 leading-none">
            <span
              className={cn(
                "font-mono-display text-[52px] font-medium tracking-tight tabular-nums text-[var(--ink)]",
                isClosed && "text-[var(--muted)] line-through decoration-2",
              )}
            >
              {formatBookingTime(d.start)}
            </span>
            <span className="ml-1.5 text-[18px] font-semibold text-[var(--muted)]">hs</span>
          </p>
        </div>

        <dl className="mt-5 space-y-3.5 text-[15.5px]">
          <div className="flex items-start gap-3">
            <dt className="sr-only">Profesional</dt>
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
            <dd className="font-medium text-[var(--ink)]">{d.medicShortName}</dd>
          </div>
          {d.consultationTypeName && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Tipo de consulta</dt>
              <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
              <dd className="text-[var(--ink-2)]">{d.consultationTypeName}</dd>
            </div>
          )}
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
                  STATUS_STYLES[status],
                )}
              >
                {ONLINE_BOOKING_STATUS_LABELS[status]}
              </span>
            </dd>
          </div>
        </dl>

        <div className="mt-6 space-y-4" aria-live="polite">
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          {actionArea}
        </div>
      </Panel>
    </PublicShell>
  );
}

function NewBookingLink({ primary = false }: { primary?: boolean }) {
  if (primary) {
    return (
      <Link href="/reservar" className={btnPrimary} style={{ color: "#fff" }}>
        Pedir un turno nuevo
      </Link>
    );
  }
  return (
    <Link href="/" className={linkMuted} style={linkMutedStyle}>
      Ir al sitio del consultorio
    </Link>
  );
}
