"use client";

// Copias de la historia clínica para el paciente (Ley 26.529 arts. 14 y 19).
// - Lista de solicitudes del paciente y formulario para registrar una nueva
//   (admin / médico / secretaria: la secretaria atiende el mostrador).
// - "Generar y entregar PDF" solo para admin / médico: descarga el PDF (fetch →
//   blob) y la API marca la solicitud como entregada.

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/auth-client";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { cn } from "@/lib/utils";
import {
  HC_COPY_AUTHORIZATION_HINTS,
  HC_COPY_REQUESTER_LABELS,
  HC_COPY_REQUESTER_TYPES,
  HC_COPY_STATUS_LABELS,
  canDeliverHcCopy,
  canRegisterHcCopy,
  type HcCopyRequestItem,
  type HcCopyRequesterTypeValue,
} from "@/lib/hc-copy-shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dateTimeFmt = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

const HOUR_MS = 60 * 60 * 1000;

function dueLabel(dueAt: string, now: Date = new Date()): string {
  const diff = new Date(dueAt).getTime() - now.getTime();
  if (diff > 0) {
    const hours = Math.floor(diff / HOUR_MS);
    return hours < 1 ? "Vence en menos de 1 h" : `Vence en ${hours} h`;
  }
  const late = Math.abs(diff);
  const hours = Math.floor(late / HOUR_MS);
  if (hours < 1) return "Vencida hace menos de 1 h";
  if (hours < 48) return `Vencida hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Vencida hace ${days} días`;
}

function filenameFrom(contentDisposition: string | null): string | null {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  return json?.error ?? fallback;
}

// ─── Form ─────────────────────────────────────────────────────────────────────

interface FormState {
  requesterType: HcCopyRequesterTypeValue;
  requesterName: string;
  requesterDni: string;
  authorizationNote: string;
  reason: string;
}

const EMPTY_FORM: FormState = {
  requesterType: "PATIENT",
  requesterName: "",
  requesterDni: "",
  authorizationNote: "",
  reason: "",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (form.requesterName.trim().length < 2) {
    errors.requesterName = "Ingresá el nombre del solicitante";
  }
  if (form.requesterType !== "PATIENT" && !form.authorizationNote.trim()) {
    errors.authorizationNote = "Indicá cómo se acreditó el vínculo o la autorización";
  }
  return errors;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ request }: { request: HcCopyRequestItem }) {
  if (request.status === "PENDING") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1",
          request.overdue
            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
        )}
      >
        {request.overdue ? <AlertTriangle /> : <Clock />}
        {request.overdue ? "Vencida" : HC_COPY_STATUS_LABELS.PENDING}
      </Badge>
    );
  }
  if (request.status === "DELIVERED") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        <CheckCircle2 />
        {HC_COPY_STATUS_LABELS.DELIVERED}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Ban />
      {HC_COPY_STATUS_LABELS.CANCELLED}
    </Badge>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-foreground">{children}</dd>
    </div>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function HcCopyDialog({
  patientId,
  open,
  onOpenChange,
}: {
  patientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user.role ?? null;
  const canManage = canRegisterHcCopy(role);
  const canDeliver = canDeliverHcCopy(role);

  const baseUrl = `/api/patients/${patientId}/hc-copy-requests`;
  const { data, error, isLoading, refresh } = useCachedFetch<HcCopyRequestItem[]>(
    open && canManage ? baseUrl : null,
  );
  const requests = data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const [confirmDeliverId, setConfirmDeliverId] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const formVisible = showForm || (!isLoading && !error && data !== undefined && requests.length === 0);

  function resetTransientState() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setConfirmDeliverId(null);
    setDeliveryNote("");
    setConfirmCancelId(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetTransientState();
    onOpenChange(next);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterType: form.requesterType,
          requesterName: form.requesterName.trim(),
          requesterDni: form.requesterDni.trim() || null,
          authorizationNote: form.authorizationNote.trim() || null,
          reason: form.reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[] | undefined> };
        } | null;
        const serverErrors: FieldErrors = {};
        for (const [key, messages] of Object.entries(json?.details?.fieldErrors ?? {})) {
          if (messages?.[0]) serverErrors[key as keyof FormState] = messages[0];
        }
        setFieldErrors(serverErrors);
        toast.error(json?.error ?? "No se pudo registrar la solicitud");
        return;
      }
      toast.success("Solicitud registrada. Plazo de entrega: 48 horas.");
      setForm(EMPTY_FORM);
      setFieldErrors({});
      setShowForm(false);
      await refresh();
    } catch {
      toast.error("No se pudo registrar la solicitud");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeliver(request: HcCopyRequestItem, note?: string) {
    setBusyId(request.id);
    try {
      const res = await fetch(`${baseUrl}/${request.id}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note?.trim() ? { deliveryNote: note.trim() } : {}),
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "No se pudo generar la copia"));
      }
      const blob = await res.blob();
      downloadBlob(blob, filenameFrom(res.headers.get("Content-Disposition")) ?? "historia-clinica.pdf");
      toast.success(
        request.status === "PENDING"
          ? "Copia generada y marcada como entregada"
          : "Copia descargada nuevamente",
      );
      setConfirmDeliverId(null);
      setDeliveryNote("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar la copia");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(request: HcCopyRequestItem) {
    setBusyId(request.id);
    try {
      const res = await fetch(`${baseUrl}/${request.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "No se pudo cancelar la solicitud"));
      }
      toast.success("Solicitud cancelada");
      setConfirmCancelId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cancelar la solicitud");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Copias de la historia clínica
          </DialogTitle>
          <DialogDescription>
            Ley 26.529 (art. 14): el paciente tiene derecho a una copia de su historia clínica,
            autenticada por el establecimiento, dentro de las 48 horas de solicitada. La copia
            es completa: incluye todos los profesionales y los asientos anulados.
          </DialogDescription>
        </DialogHeader>

        {sessionStatus === "loading" ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : !canManage ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Tu rol no permite gestionar copias de la historia clínica.
          </p>
        ) : (
          <div className="space-y-5">
            {/* ── Solicitudes ── */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  Solicitudes
                  {requests.length > 0 && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({requests.length}
                      {pendingCount > 0 ? ` · ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` : ""})
                    </span>
                  )}
                </h4>
                {!formVisible && (
                  <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                    <Plus />
                    Nueva solicitud
                  </Button>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando solicitudes…
                </div>
              ) : error ? (
                <p className="text-sm text-destructive">No se pudieron cargar las solicitudes.</p>
              ) : requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay solicitudes de copia registradas para este paciente.
                </p>
              ) : (
                <ul className="space-y-2">
                  {requests.map((r) => {
                    const busy = busyId === r.id;
                    return (
                      <li key={r.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge request={r} />
                              <span className="truncate text-sm font-medium">{r.requesterName}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {HC_COPY_REQUESTER_LABELS[r.requesterType] ?? r.requesterType}
                              {r.requesterDni ? ` · DNI ${r.requesterDni}` : ""}
                            </p>
                          </div>
                          <div className="text-right text-xs">
                            {r.status === "PENDING" && (
                              <span
                                className={cn(
                                  "font-medium",
                                  r.overdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                                )}
                              >
                                {dueLabel(r.dueAt)}
                              </span>
                            )}
                            {r.status === "DELIVERED" && (
                              <span className="text-muted-foreground">
                                Entregada el {fmtDateTime(r.deliveredAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        <dl className="mt-2 space-y-1 text-xs">
                          <InfoRow label="Solicitada">
                            {fmtDateTime(r.requestedAt)}
                            {r.registeredBy ? ` · registró ${r.registeredBy.name}` : ""}
                          </InfoRow>
                          {r.status === "PENDING" && (
                            <InfoRow label="Vence">{fmtDateTime(r.dueAt)}</InfoRow>
                          )}
                          {r.authorizationNote && (
                            <InfoRow label="Acreditación">{r.authorizationNote}</InfoRow>
                          )}
                          {r.reason && <InfoRow label="Motivo">{r.reason}</InfoRow>}
                          {r.status === "DELIVERED" && (
                            <InfoRow label="Entregó">
                              {r.deliveredBy?.name ?? "—"}
                              {r.deliveryNote ? ` · ${r.deliveryNote}` : ""}
                            </InfoRow>
                          )}
                          {r.documentHash && (
                            <InfoRow label="SHA-256">
                              <span className="font-mono text-[11px]" title={r.documentHash}>
                                {r.documentHash.slice(0, 16)}…{r.documentHash.slice(-8)}
                              </span>
                            </InfoRow>
                          )}
                        </dl>

                        {/* Acciones */}
                        {r.status === "PENDING" && confirmDeliverId === r.id && (
                          <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3">
                            <Label htmlFor={`delivery-note-${r.id}`} className="text-xs">
                              Nota de entrega (opcional)
                            </Label>
                            <Input
                              id={`delivery-note-${r.id}`}
                              value={deliveryNote}
                              maxLength={500}
                              placeholder="Ej.: entregada en mano, enviada por email"
                              onChange={(e) => setDeliveryNote(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Se descargará el PDF y la solicitud quedará como entregada. Recordá
                              firmar la copia impresa para autenticarla.
                            </p>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmDeliverId(null);
                                  setDeliveryNote("");
                                }}
                              >
                                Volver
                              </Button>
                              <Button size="sm" disabled={busy} onClick={() => handleDeliver(r, deliveryNote)}>
                                {busy ? <Loader2 className="animate-spin" /> : <Download />}
                                Confirmar y descargar
                              </Button>
                            </div>
                          </div>
                        )}

                        {r.status === "PENDING" && confirmCancelId === r.id && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-3">
                            <span className="text-xs">¿Cancelar esta solicitud?</span>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => setConfirmCancelId(null)}
                              >
                                No
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy}
                                onClick={() => handleCancel(r)}
                              >
                                {busy && <Loader2 className="animate-spin" />}
                                Sí, cancelar
                              </Button>
                            </div>
                          </div>
                        )}

                        {r.status === "PENDING" &&
                          confirmDeliverId !== r.id &&
                          confirmCancelId !== r.id && (
                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                              {!canDeliver && (
                                <span className="mr-auto text-xs text-muted-foreground">
                                  La copia la genera un médico o el administrador.
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmDeliverId(null);
                                  setConfirmCancelId(r.id);
                                }}
                              >
                                <Ban />
                                Cancelar
                              </Button>
                              {canDeliver && (
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    setConfirmCancelId(null);
                                    setDeliveryNote("");
                                    setConfirmDeliverId(r.id);
                                  }}
                                >
                                  <Download />
                                  Generar y entregar PDF
                                </Button>
                              )}
                            </div>
                          )}

                        {r.status === "DELIVERED" && canDeliver && (
                          <div className="mt-3 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => handleDeliver(r)}
                            >
                              {busy ? <Loader2 className="animate-spin" /> : <Download />}
                              Volver a descargar
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ── Registrar solicitud ── */}
            {formVisible && (
              <section className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Registrar solicitud</h4>
                  {requests.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowForm(false);
                        setForm(EMPTY_FORM);
                        setFieldErrors({});
                      }}
                    >
                      Cerrar
                    </Button>
                  )}
                </div>
                <form className="space-y-3" onSubmit={handleRegister} noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="hc-requester-type">Quién la solicita</Label>
                    <Select
                      value={form.requesterType}
                      onValueChange={(v) => update("requesterType", v as HcCopyRequesterTypeValue)}
                    >
                      <SelectTrigger id="hc-requester-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HC_COPY_REQUESTER_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {HC_COPY_REQUESTER_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                    <div className="space-y-1.5">
                      <Label htmlFor="hc-requester-name">Nombre y apellido del solicitante</Label>
                      <Input
                        id="hc-requester-name"
                        value={form.requesterName}
                        maxLength={120}
                        aria-invalid={!!fieldErrors.requesterName}
                        onChange={(e) => update("requesterName", e.target.value)}
                      />
                      {fieldErrors.requesterName && (
                        <p className="text-xs text-destructive">{fieldErrors.requesterName}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hc-requester-dni">DNI</Label>
                      <Input
                        id="hc-requester-dni"
                        value={form.requesterDni}
                        maxLength={20}
                        inputMode="numeric"
                        aria-invalid={!!fieldErrors.requesterDni}
                        onChange={(e) => update("requesterDni", e.target.value)}
                      />
                      {fieldErrors.requesterDni && (
                        <p className="text-xs text-destructive">{fieldErrors.requesterDni}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="hc-authorization">
                      Cómo acreditó el vínculo o la autorización
                      {form.requesterType === "PATIENT" ? (
                        <span className="font-normal text-muted-foreground"> (opcional)</span>
                      ) : null}
                    </Label>
                    <Textarea
                      id="hc-authorization"
                      rows={2}
                      maxLength={1000}
                      value={form.authorizationNote}
                      placeholder={HC_COPY_AUTHORIZATION_HINTS[form.requesterType]}
                      aria-invalid={!!fieldErrors.authorizationNote}
                      onChange={(e) => update("authorizationNote", e.target.value)}
                    />
                    {fieldErrors.authorizationNote && (
                      <p className="text-xs text-destructive">{fieldErrors.authorizationNote}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="hc-reason">
                      Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Textarea
                      id="hc-reason"
                      rows={2}
                      maxLength={1000}
                      value={form.reason}
                      onChange={(e) => update("reason", e.target.value)}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Al registrarla, el plazo legal de entrega vence en 48 horas.
                  </p>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>
                      {saving && <Loader2 className="animate-spin" />}
                      Registrar solicitud
                    </Button>
                  </div>
                </form>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
