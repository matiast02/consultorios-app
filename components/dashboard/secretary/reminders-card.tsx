"use client";

import { Mail, Pencil } from "lucide-react";
import type { SecretaryRemindersData } from "@/types";

interface RemindersCardProps {
  data: SecretaryRemindersData;
  sending?: boolean;
  onSendPending: () => void;
  onEdit: () => void;
}

export function RemindersCard({ data, sending, onSendPending, onEdit }: RemindersCardProps) {
  const contextLabel = data.context === "tomorrow" ? "Mañana · jornada" : "Hoy · jornada";

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50/60 px-4 py-2.5 dark:bg-amber-950/20">
        <div className="text-[13px] text-foreground">
          <span className="font-bold text-foreground tabular-nums">{data.pending || data.total}</span>{" "}
          <span className="text-muted-foreground">recordatorios para enviar</span>
        </div>
        <span className="rounded-full bg-card px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
          {contextLabel}
        </span>
      </div>

      {data.items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No hay recordatorios para mañana.
        </div>
      ) : (
        <ul className="divide-y">
          {data.items.map((it) => {
            const isSent = it.status === "SENT";
            return (
              <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-12 shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                  {it.time}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {it.patientShortName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    {it.medicColor && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: it.medicColor }}
                      />
                    )}
                    {it.medicShortName}
                  </div>
                </div>
                <span
                  className={
                    isSent
                      ? "inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  }
                >
                  {isSent ? "✓ Enviado" : "Pendiente"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        <button
          type="button"
          disabled={sending || data.pending === 0}
          onClick={onSendPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0d4f4d] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d] disabled:opacity-50"
        >
          <Mail className="h-3.5 w-3.5" />
          Enviar {data.pending} pendientes
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar recordatorios"
          className="grid h-9 w-9 place-items-center rounded-lg border bg-card text-foreground/60 transition hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
