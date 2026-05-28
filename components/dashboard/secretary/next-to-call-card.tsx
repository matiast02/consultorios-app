"use client";

import { Phone, PhoneCall } from "lucide-react";
import type { NextToCallData } from "@/types";

interface NextToCallCardProps {
  data: NextToCallData | null;
  onCall: () => void;
}

function formatTimeAmPm(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p. m." : "a. m.";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function NextToCallCard({ data, onCall }: NextToCallCardProps) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          Próximo a llamar
        </div>
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          No hay pacientes en sala esperando.
        </p>
      </div>
    );
  }

  const fullName = `${data.patient.lastName}, ${data.patient.firstName}`;

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 shadow-md ring-1 ring-black/5"
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
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.7)]" />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-emerald-100/85">
            Próximo a llamar
          </span>
        </div>

        <div className="mt-2.5">
          <h2 className="text-xl font-bold text-white">{fullName}</h2>
          <p className="mt-1 text-[13px] leading-snug text-emerald-100/85">
            {data.medicShortName}
            {data.room ? <> · {data.room}</> : null}
            {data.shiftStart ? <> · turno {formatTimeAmPm(data.shiftStart)}</> : null}
            {" · "}
            <span className="text-emerald-100/95">
              esperando hace {data.minutesWaiting} min
            </span>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCall}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#0d4f4d] shadow-sm transition hover:bg-emerald-50"
          >
            <PhoneCall className="h-4 w-4" />
            Llamar a consultorio
          </button>
          <button
            type="button"
            aria-label="Marcar telefónicamente"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/[0.08] text-white backdrop-blur-sm transition hover:bg-white/[0.16]"
          >
            <Phone className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
