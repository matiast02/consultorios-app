"use client";

import { useEffect, useState, type ComponentType } from "react";
import { addDays, format, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  PhoneOff,
  RotateCw,
  Send,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ReminderChannel,
  ReminderDispatchSummary,
  ReminderItem,
  SecretaryRemindersData,
} from "@/types";

// Contrato: contracts/api-schemas/reminders.yaml
//   GET   /api/shifts/reminders?date=YYYY-MM-DD
//   PATCH /api/shifts/reminders/{id}  { action: mark_sent | mark_failed | retry, note? }

type RemindersContext = SecretaryRemindersData["context"];
type ReminderAction = "mark_sent" | "mark_failed" | "retry";

interface RemindersCardProps {
  data: SecretaryRemindersData;
  sending?: boolean;
  onSendPending: () => void;
  onEdit: () => void;
  /** Después de marcar / reintentar un recordatorio (para refrescar el dashboard). */
  onChanged?: () => void;
}

// ─── Helpers exportados ──────────────────────────────────────────────────────

/** Resumen legible de POST /api/shifts/reminders/send para un toast. */
export function formatDispatchSummary(summary: Partial<ReminderDispatchSummary> | null | undefined): {
  title: string;
  description?: string;
  tone: "success" | "warning" | "info";
} {
  const s = summary ?? {};
  const sentEmail = s.sentEmail ?? 0;
  const manual = s.manualPending ?? 0;
  const failed = s.failed ?? 0;
  const noContact = s.skippedNoContact ?? 0;
  const optOut = s.skippedOptOut ?? 0;

  const parts: string[] = [];
  if (sentEmail) parts.push(`${sentEmail} ${sentEmail === 1 ? "email enviado" : "emails enviados"}`);
  if (manual) parts.push(`${manual} WhatsApp para enviar a mano`);
  if (failed) parts.push(`${failed} ${failed === 1 ? "falló" : "fallaron"}`);

  const extra: string[] = [];
  if (noContact) extra.push(`${noContact} sin email ni teléfono`);
  if (optOut) extra.push(`${optOut} ${optOut === 1 ? "pidió" : "pidieron"} no recibir recordatorios`);
  const description = extra.length ? extra.join(" · ") : undefined;

  if (parts.length === 0) {
    return { title: "No había recordatorios para enviar", description, tone: "info" };
  }
  return { title: parts.join(" · "), description, tone: failed ? "warning" : "success" };
}

// ─── Constantes de presentación ─────────────────────────────────────────────

const CHANNEL_META: Record<
  ReminderChannel,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  EMAIL: {
    label: "Email",
    icon: Mail,
    className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
  },
  WHATSAPP: {
    label: "WhatsApp",
    icon: MessageCircle,
    className:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300",
  },
  SMS: {
    label: "SMS",
    icon: Smartphone,
    className:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  },
};

const pill = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap";
const smallBtn =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

const WA_OPENED_KEY = "reminders:wa-opened";

function dateFor(ctx: RemindersContext): string {
  const base = new Date();
  return format(ctx === "tomorrow" ? addDays(base, 1) : base, "yyyy-MM-dd");
}

function summarize(context: RemindersContext, items: ReminderItem[]): SecretaryRemindersData {
  return {
    context,
    total: items.length,
    pending: items.filter((i) => i.status === "PENDING").length,
    sent: items.filter((i) => i.status === "SENT").length,
    items,
  };
}

function readOpenedFromSession(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const ids = JSON.parse(window.sessionStorage.getItem(WA_OPENED_KEY) ?? "[]");
    return Array.isArray(ids) ? Object.fromEntries(ids.map((id: string) => [id, true as const])) : {};
  } catch {
    return {};
  }
}

function relative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: es });
}

async function patchReminder(id: string, action: ReminderAction, note?: string): Promise<ReminderItem | null> {
  const res = await fetch(`/api/shifts/reminders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note ? { action, note } : { action }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    if (res.status === 403) throw new Error("Solo recepción o administración pueden gestionar recordatorios");
    if (res.status === 404) throw new Error("El recordatorio ya no existe");
    throw new Error(typeof json?.error === "string" ? json.error : "No se pudo actualizar el recordatorio");
  }
  return (json.data as ReminderItem | undefined) ?? null;
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function ChannelBadge({ item }: { item: ReminderItem }) {
  if (!item.channel) return null;
  const meta = CHANNEL_META[item.channel];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(pill, "border", meta.className)}
      title={item.deliveredTo ? `${meta.label}: ${item.deliveredTo}` : meta.label}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function StatusBadge({ item }: { item: ReminderItem }) {
  if (item.status === "SENT") {
    return (
      <span
        className={cn(pill, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300")}
        title={item.deliveredTo ? `Enviado a ${item.deliveredTo}` : undefined}
      >
        ✓ Enviado
      </span>
    );
  }
  if (item.status === "FAILED") {
    const detail = item.errorMessage?.trim() || "Sin detalle del error.";
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={detail}
            aria-label={`Falló el envío: ${detail}`}
            className={cn(
              pill,
              "cursor-help bg-rose-100 text-rose-700 hover:bg-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            Falló
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3 text-xs">
          <p className="font-semibold text-foreground">No se pudo enviar</p>
          <p className="mt-1 break-words text-muted-foreground">{detail}</p>
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <span className={cn(pill, "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}>
      Pendiente
    </span>
  );
}

function ResponseLine({ item }: { item: ReminderItem }) {
  if (!item.response) return null;
  const when = relative(item.respondedAt);
  const confirmed = item.response === "CONFIRMED";
  return (
    <div
      className={cn(
        "mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold",
        confirmed ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", confirmed ? "bg-emerald-500" : "bg-rose-500")}
        aria-hidden
      />
      {confirmed ? "Confirmó" : "Canceló"}
      {when && <span className="font-normal text-muted-foreground">· {when}</span>}
    </div>
  );
}

function MarkFailedButton({
  disabled,
  label = "Marcar fallido",
  onConfirm,
}: {
  disabled?: boolean;
  label?: string;
  onConfirm: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setNote("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(smallBtn, "px-1.5 font-medium text-muted-foreground hover:text-rose-600")}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConfirm(note.trim());
            setOpen(false);
            setNote("");
          }}
          className="space-y-2"
        >
          <label htmlFor="reminder-fail-note" className="text-xs font-semibold text-foreground">
            ¿Qué pasó? <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input
            id="reminder-fail-note"
            value={note}
            maxLength={200}
            autoFocus
            placeholder="Ej.: el número no tiene WhatsApp"
            onChange={(e) => setNote(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" variant="destructive">
              Marcar fallido
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function RemindersCard({ data, sending, onSendPending, onEdit, onChanged }: RemindersCardProps) {
  const [view, setView] = useState<RemindersContext>(data.context);
  const [altData, setAltData] = useState<SecretaryRemindersData | null>(null);
  const [altError, setAltError] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ReminderItem>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // WhatsApp abiertos desde acá (sobreviven a un refresh de la pestaña) y si ya volvió a la app.
  const [waOpened, setWaOpened] = useState<Record<string, true>>(readOpenedFromSession);
  const [returned, setReturned] = useState<Record<string, true>>({});

  // Datos nuevos del dashboard → descartar los cambios optimistas.
  useEffect(() => {
    setOverrides({});
  }, [data]);

  // La otra fecha (hoy / mañana) se pide aparte; se refresca junto con el dashboard.
  useEffect(() => {
    if (view === data.context) return;
    const ctrl = new AbortController();
    setAltError(false);
    fetch(`/api/shifts/reminders?date=${dateFor(view)}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !Array.isArray(json.data)) throw new Error();
        setAltData(summarize(view, json.data as ReminderItem[]));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAltError(true);
      });
    return () => ctrl.abort();
  }, [view, data]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(WA_OPENED_KEY, JSON.stringify(Object.keys(waOpened)));
    } catch {
      // sessionStorage no disponible: queda solo en memoria
    }
  }, [waOpened]);

  // Al volver a la pestaña después de abrir WhatsApp, resaltar "Marcar enviado".
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      setReturned((prev) => {
        const pendingIds = Object.keys(waOpened).filter((id) => !prev[id]);
        if (pendingIds.length === 0) return prev;
        return { ...prev, ...Object.fromEntries(pendingIds.map((id) => [id, true as const])) };
      });
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [waOpened]);

  const isMainView = view === data.context;
  const base = isMainView ? data : altData?.context === view ? altData : null;
  const items = (base?.items ?? []).map((it) => overrides[it.id] ?? it);
  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const autoPending = items.filter((i) => i.status === "PENDING" && !i.manual).length;
  const manualPending = items.filter((i) => i.status === "PENDING" && i.manual).length;
  const failedCount = items.filter((i) => i.status === "FAILED").length;
  const dayLabel = view === "tomorrow" ? "mañana" : "hoy";

  function forgetOpened(id: string) {
    setWaOpened((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setReturned((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function runAction(item: ReminderItem, action: ReminderAction, note?: string) {
    setBusyId(item.id);
    try {
      const updated = await patchReminder(item.id, action, note);
      const fallback: ReminderItem =
        action === "mark_sent"
          ? { ...item, status: "SENT" }
          : action === "mark_failed"
            ? { ...item, status: "FAILED", errorMessage: note || item.errorMessage || "Marcado como fallido" }
            : { ...item, status: "PENDING", errorMessage: null };
      const next = updated ? { ...item, ...updated } : fallback;
      setOverrides((prev) => ({ ...prev, [item.id]: next }));

      if (action === "mark_sent") {
        forgetOpened(item.id);
        toast.success(`Recordatorio a ${item.patientShortName} marcado como enviado`);
      } else if (action === "mark_failed") {
        forgetOpened(item.id);
        toast.success("Recordatorio marcado como fallido");
      } else if (next.status === "SENT") {
        toast.success("Recordatorio reenviado");
      } else if (next.status === "FAILED") {
        toast.error("Volvió a fallar", { description: next.errorMessage ?? undefined });
      } else {
        toast.success(
          next.manual ? "Listo, quedó pendiente para enviar por WhatsApp" : "Recordatorio en cola para reenviar",
        );
      }
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el recordatorio");
    } finally {
      setBusyId(null);
    }
  }

  function renderActions(it: ReminderItem) {
    const busy = busyId === it.id;
    if (it.status === "FAILED") {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction(it, "retry")}
          className={cn(smallBtn, "border bg-card text-foreground hover:bg-muted")}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
          Reintentar
        </button>
      );
    }
    if (it.status !== "PENDING" || !(it.manual && it.channel === "WHATSAPP")) return null;

    if (!it.waLink) {
      return (
        <>
          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
            <PhoneOff className="h-3 w-3" />
            Sin teléfono
          </span>
          <MarkFailedButton disabled={busy} onConfirm={(note) => void runAction(it, "mark_failed", note)} />
        </>
      );
    }

    const opened = !!waOpened[it.id];
    const back = !!returned[it.id];
    const openLink = (
      <a
        href={it.waLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          setWaOpened((prev) => ({ ...prev, [it.id]: true }));
          setReturned((prev) => {
            if (!prev[it.id]) return prev;
            const next = { ...prev };
            delete next[it.id];
            return next;
          });
        }}
        className={cn(
          smallBtn,
          opened
            ? "px-1.5 font-medium text-muted-foreground hover:text-foreground"
            : "bg-[#25D366] text-white shadow-sm hover:bg-[#1ebe5b]",
        )}
      >
        {opened ? <ExternalLink className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
        {opened ? "Abrir de nuevo" : "Abrir WhatsApp"}
      </a>
    );

    if (!opened) {
      return (
        <>
          {openLink}
          <MarkFailedButton disabled={busy} onConfirm={(note) => void runAction(it, "mark_failed", note)} />
        </>
      );
    }

    return (
      <>
        {back && <span className="w-full text-[11.5px] font-medium text-foreground">¿Enviaste el mensaje?</span>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction(it, "mark_sent")}
          className={cn(
            smallBtn,
            "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
            back && "ring-2 ring-emerald-300 ring-offset-1 ring-offset-card dark:ring-emerald-700",
          )}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Marcar enviado
        </button>
        <MarkFailedButton
          disabled={busy}
          label="No se pudo"
          onConfirm={(note) => void runAction(it, "mark_failed", note)}
        />
        {openLink}
      </>
    );
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50/60 px-4 py-2.5 dark:bg-amber-950/20">
        <div className="text-[13px] text-foreground">
          <span className="font-bold tabular-nums text-foreground">{pendingCount}</span>{" "}
          <span className="text-muted-foreground">
            {pendingCount === 1 ? "recordatorio para enviar" : "recordatorios para enviar"}
          </span>
          {failedCount > 0 && (
            <span className="text-rose-600 dark:text-rose-400"> · {failedCount} con error</span>
          )}
        </div>
        <div
          role="group"
          aria-label="Día de los turnos"
          className="inline-flex rounded-full bg-card p-0.5 text-[10.5px] font-medium shadow-xs ring-1 ring-border"
        >
          {(["today", "tomorrow"] as const).map((ctx) => (
            <button
              key={ctx}
              type="button"
              aria-pressed={view === ctx}
              onClick={() => setView(ctx)}
              className={cn(
                "rounded-full px-2.5 py-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                view === ctx ? "bg-[#0d4f4d] text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ctx === "today" ? "Hoy" : "Mañana"}
            </button>
          ))}
        </div>
      </div>

      {!base ? (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground">
          {altError ? (
            <>
              No se pudieron cargar los recordatorios de {dayLabel}.
              <button
                type="button"
                className="font-semibold text-foreground underline underline-offset-2"
                onClick={() => {
                  setAltError(false);
                  setView(data.context);
                }}
              >
                Volver
              </button>
            </>
          ) : (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
            </>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No hay recordatorios para {dayLabel}.
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y overflow-y-auto">
          {items.map((it) => {
            const actions = renderActions(it);
            return (
              <li
                key={it.id}
                className={cn(
                  "px-4 py-2.5 transition-colors",
                  returned[it.id] && it.status === "PENDING" && "bg-emerald-50/60 dark:bg-emerald-950/20",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="w-12 shrink-0 pt-px text-[13px] font-semibold tabular-nums text-foreground">
                    {it.time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground">{it.patientShortName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
                      {it.medicColor && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: it.medicColor }}
                          aria-hidden
                        />
                      )}
                      {it.medicShortName}
                      {typeof it.offsetHours === "number" && (
                        <span className="text-muted-foreground/80">· aviso {it.offsetHours} h antes</span>
                      )}
                    </div>
                    <ResponseLine item={it} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ChannelBadge item={it} />
                    <StatusBadge item={it} />
                  </div>
                </div>
                {actions && <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[60px]">{actions}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {manualPending > 0 && (
        <div className="flex items-center gap-1.5 border-t bg-green-50/50 px-4 py-2 text-[11.5px] text-green-800 dark:bg-green-950/20 dark:text-green-300">
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          {manualPending === 1
            ? "1 WhatsApp espera que lo envíes a mano."
            : `${manualPending} WhatsApp esperan que los envíes a mano.`}
        </div>
      )}

      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        <button
          type="button"
          disabled={sending}
          onClick={onSendPending}
          title="Genera los recordatorios de los próximos turnos y envía los que ya correspondan"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0d4f4d] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d] disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {sending
            ? "Enviando…"
            : autoPending > 0
              ? `Enviar ${autoPending} ${autoPending === 1 ? "pendiente" : "pendientes"}`
              : "Enviar recordatorios"}
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
