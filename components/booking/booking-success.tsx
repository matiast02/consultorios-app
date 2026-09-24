"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Copy, ExternalLink, Mail, Stethoscope, UserRound } from "lucide-react";
import { formatBookingDate, formatBookingTime } from "@/lib/booking-client";
import { ONLINE_BOOKING_STATUS_LABELS } from "@/types";
import type { BookingDone } from "./booking-storage";
import { Panel, btnOutline, linkMuted, linkMutedStyle } from "./public-ui";

// Pantalla final de /reservar. El link de gestión (/reserva/<token>) se muestra
// siempre: si no hay email, es la única forma de ver o cancelar la reserva.

export function BookingSuccess({ done, onNewBooking }: { done: BookingDone; onNewBooking: () => void }) {
  const { created, notes, specialtyName, consultationTypeName } = done;
  const [copied, setCopied] = useState(false);
  const [absoluteUrl, setAbsoluteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!created.manageUrl) return;
    try {
      setAbsoluteUrl(new URL(created.manageUrl, window.location.origin).href);
    } catch {
      setAbsoluteUrl(null);
    }
  }, [created.manageUrl]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyLink() {
    if (!absoluteUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles: el link igual queda visible para copiarlo a mano.
    }
  }

  // `created.message` no se muestra: repite lo que ya dicen los textos fijos de esta pantalla.
  const detail = [specialtyName, consultationTypeName].filter(Boolean).join(" · ");

  return (
    <Panel>
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[var(--primary)] text-white shadow-[0_8px_20px_rgba(10,138,158,0.28)]">
          <Check className="h-7 w-7" />
        </div>
        <h1
          id="booking-step-title"
          tabIndex={-1}
          className="text-[24px] font-bold leading-tight tracking-tight text-[var(--ink)] outline-none"
        >
          ¡Listo! Tu solicitud quedó registrada
        </h1>
        <p className="mt-1.5 text-[16px] text-[var(--ink-2)]">Recepción la confirma y te avisa.</p>
        <span className="mt-3 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[13px] font-semibold text-amber-800 ring-1 ring-amber-200">
          {ONLINE_BOOKING_STATUS_LABELS.PENDING_CONFIRMATION}
        </span>
      </div>

      <div className="mt-5 rounded-2xl bg-[var(--section-tint)] px-5 py-4">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--primary-deep)]">
          <CalendarDays className="h-[18px] w-[18px]" aria-hidden />
          {formatBookingDate(created.start)}
        </p>
        <p className="mt-1 leading-none">
          <span className="font-mono-display text-[46px] font-medium tracking-tight tabular-nums text-[var(--ink)]">
            {formatBookingTime(created.start)}
          </span>
          <span className="ml-1.5 text-[18px] font-semibold text-[var(--muted)]">hs</span>
        </p>
        <div className="mt-3 space-y-1 border-t border-[var(--border-strong)]/60 pt-3 text-[15px]">
          <p className="flex items-center gap-2 font-medium text-[var(--ink)]">
            <UserRound className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
            {created.medicShortName}
          </p>
          {detail && (
            <p className="flex items-center gap-2 text-[var(--ink-2)]">
              <Stethoscope className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
              {detail}
            </p>
          )}
        </div>
      </div>


      {notes && (
        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[14.5px] text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Aviso del consultorio</p>
          <p className="mt-0.5 whitespace-pre-line">{notes}</p>
        </div>
      )}

      {created.manageUrl ? (
        <div className="mt-6 space-y-3">
          <a href={created.manageUrl} className={btnOutline} style={{ color: "var(--primary-deep)" }}>
            <ExternalLink className="h-4 w-4" />
            Ver o cancelar mi reserva
          </a>
          {created.emailSent ? (
            <p className="flex items-start justify-center gap-2 text-center text-[14px] text-[var(--ink-2)]">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
              Te enviamos un email con este link.
            </p>
          ) : (
            <p className="text-center text-[14px] text-[var(--ink-2)]">
              Guardá este link (o sacale una captura a esta pantalla): es la forma de ver el estado o cancelar tu
              reserva.
            </p>
          )}
          {absoluteUrl && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2 ring-1 ring-[var(--border)]">
              <code className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--muted)]">{absoluteUrl}</code>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold text-[var(--primary-deep)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-soft-2)]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {copied ? "Link copiado" : ""}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col items-center gap-3">
        <button type="button" className={linkMuted} onClick={onNewBooking}>
          Pedir otro turno
        </button>
        <Link href="/" className={linkMuted} style={linkMutedStyle}>
          Volver al inicio
        </Link>
      </div>
    </Panel>
  );
}
