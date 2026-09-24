"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Check, Globe, Loader2, Phone, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDaysISO, formatBookingDateShort, formatBookingTime, todayAR } from "@/lib/booking-client";
import type { OnlineBookingStaffItem, SecretaryOnlineBookingsData } from "@/types";

// Reservas online pendientes de confirmar (recepción).
// Contrato: contracts/api-schemas/online-booking.yaml
//   PATCH /api/online-bookings/{id}  { action: "confirm" | "reject" }
// Lo cargado por el solicitante se muestra tal cual: si el DNI ya existía y el
// nombre no coincide (`patientDataMismatch`), recepción verifica por teléfono.

type BookingAction = "confirm" | "reject";

interface OnlineBookingsCardProps {
  data: SecretaryOnlineBookingsData;
  /** Después de confirmar / rechazar (para refrescar el dashboard). */
  onChanged?: () => void;
}

const smallBtn =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";
const pill = "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = todayAR(d);
  const today = todayAR();
  if (day === today) return "Hoy";
  if (day === addDaysISO(today, 1)) return "Mañana";
  return formatBookingDateShort(iso);
}

function relative(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: es });
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

async function patchBooking(id: string, action: BookingAction): Promise<void> {
  const res = await fetch(`/api/online-bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (res.ok) return;
  const json = await res.json().catch(() => null);
  if (res.status === 403) throw new Error("Solo recepción o administración pueden gestionar reservas online");
  if (res.status === 404) throw Object.assign(new Error("La reserva ya no existe"), { gone: true });
  if (res.status === 409) {
    throw Object.assign(new Error("La reserva ya no está pendiente (quizás el paciente la canceló)"), { gone: true });
  }
  throw new Error(typeof json?.error === "string" ? json.error : "No se pudo actualizar la reserva");
}

function RejectButton({ disabled, busy, onConfirm }: { disabled?: boolean; busy?: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(smallBtn, "border bg-card text-foreground hover:border-rose-300 hover:text-rose-700")}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          Rechazar
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <p className="text-xs font-semibold text-foreground">¿Rechazar la reserva?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Se cancela el turno y el horario queda libre. Avisale al paciente.
        </p>
        <div className="mt-3 flex justify-end gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Volver
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Rechazar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function OnlineBookingsCard({ data, onChanged }: OnlineBookingsCardProps) {
  // Ocultamiento optimista de lo ya resuelto hasta que llegue el refresh del dashboard.
  const [resolved, setResolved] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<{ id: string; action: BookingAction } | null>(null);

  useEffect(() => {
    setResolved({});
  }, [data]);

  const pendingItems = data.items.filter((it) => !it.status || it.status === "PENDING_CONFIRMATION");
  const items = pendingItems.filter((it) => !resolved[it.id]);
  const hiddenCount = pendingItems.length - items.length;
  const pending = Math.max(0, data.pending - hiddenCount);

  async function run(item: OnlineBookingStaffItem, action: BookingAction) {
    const name = `${item.requester.firstName} ${item.requester.lastName}`.trim();
    setBusy({ id: item.id, action });
    try {
      await patchBooking(item.id, action);
      setResolved((prev) => ({ ...prev, [item.id]: true }));
      if (action === "confirm") {
        toast.success(`Turno de ${name} confirmado`, { description: "Recordá avisarle al paciente." });
      } else {
        toast.success(`Reserva de ${name} rechazada`, { description: "El horario quedó libre." });
      }
      onChanged?.();
    } catch (err) {
      const gone = !!(err as { gone?: boolean } | null)?.gone;
      if (gone) {
        setResolved((prev) => ({ ...prev, [item.id]: true }));
        toast.info(err instanceof Error ? err.message : "La reserva ya no está pendiente");
        onChanged?.();
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar la reserva");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Reservas online
        </div>
        {pending > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {pending} por confirmar
          </span>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">Al día</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No hay reservas online para confirmar.
        </div>
      ) : (
        <ul className="max-h-[480px] divide-y overflow-y-auto">
          {items.map((it) => {
            const r = it.requester;
            const isBusy = busy?.id === it.id;
            const created = relative(it.createdAt);
            return (
              <li key={it.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="w-14 shrink-0 pt-px text-center leading-tight">
                    <div className="text-[10.5px] font-medium text-muted-foreground">{dayLabel(it.start)}</div>
                    <div className="text-[14px] font-semibold tabular-nums text-foreground">
                      {formatBookingTime(it.start)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-foreground">
                        {r.lastName}, {r.firstName}
                      </span>
                      {it.matchedExisting ? (
                        <span className={cn(pill, "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300")}>
                          Ya era paciente
                        </span>
                      ) : (
                        <span
                          className={cn(pill, "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300")}
                        >
                          Paciente nuevo
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
                      <span className="tabular-nums">DNI {r.dni}</span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{r.phone}</span>
                      {r.healthInsuranceText && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{r.healthInsuranceText}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
                      {it.medicColor && (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: it.medicColor }} aria-hidden />
                      )}
                      {it.medicShortName}
                      {it.consultationTypeName && <span>· {it.consultationTypeName}</span>}
                      {created && <span className="text-muted-foreground/80">· pedida {created}</span>}
                    </div>
                  </div>
                </div>

                {it.patientDataMismatch && (
                  <div
                    role="note"
                    className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>
                      Los datos no coinciden con el paciente registrado con ese DNI, verificá por teléfono antes de
                      confirmar.
                    </span>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[68px]">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void run(it, "confirm")}
                    className={cn(smallBtn, "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700")}
                  >
                    {isBusy && busy?.action === "confirm" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Confirmar
                  </button>
                  <RejectButton
                    disabled={!!busy}
                    busy={isBusy && busy?.action === "reject"}
                    onConfirm={() => void run(it, "reject")}
                  />
                  <a
                    href={telHref(r.phone)}
                    className={cn(smallBtn, "px-1.5 font-medium text-muted-foreground hover:text-foreground")}
                  >
                    <Phone className="h-3 w-3" />
                    Llamar
                  </a>
                  <Link
                    href={`/dashboard/pacientes/${encodeURIComponent(it.patientId)}`}
                    className={cn(smallBtn, "px-1.5 font-medium text-muted-foreground hover:text-foreground")}
                  >
                    <UserRound className="h-3 w-3" />
                    Ver paciente
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pending > items.length && items.length > 0 && (
        <div className="border-t px-4 py-2 text-[11.5px] text-muted-foreground">
          Mostrando las {items.length} más antiguas de {pending}. Al confirmarlas aparecen las siguientes.
        </div>
      )}
    </div>
  );
}
