"use client";

// Diálogos de concesiones de acceso a la historia clínica (ClinicalAccessGrant):
// - RequestAccessDialog: un médico sin relación pide acceso (alcance + motivo).
// - ApproveAccessDialog: el tratante / admin aprueba registrando el
//   consentimiento del paciente y la vigencia.
// - GrantNoteDialog: rechazar (motivo obligatorio) o revocar (nota opcional).
// Contrato: lib/openapi/paths/grants-hc-copy.ts

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import {
  CONSENT_TYPES,
  CONSENT_TYPE_LABELS,
  GRANT_DEFAULT_DAYS,
  GRANT_MAX_DAYS,
  GRANT_SECTIONS,
  GRANT_SECTION_LABELS,
  describeGrantScope,
  type ConsentTypeValue,
  type GrantScopeValue,
  type GrantSection,
} from "@/lib/clinical-grants-shared";
import type { ClinicalAccessGrant, ClinicalGrantUserRef } from "@/types";
import { fmtDateAR } from "./shared";

const DAY_MS = 24 * 60 * 60 * 1000;

const SECTION_HINTS: Record<GrantSection, string> = {
  antecedentes: "Personales, familiares y hábitos",
  alergias: "Detalle de alergias",
  medicacion: "Medicación habitual",
  evoluciones: "Todas las evoluciones",
  recetas: "Todas las recetas",
  estudios: "Todas las órdenes de estudio",
  planes: "Todos los planes alimentarios",
};

export function userDisplayName(u?: ClinicalGrantUserRef | null): string {
  if (!u) return "Profesional";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || "Profesional";
}

export function grantScopeLabel(g: Pick<ClinicalAccessGrant, "scope" | "sections" | "entryIds">): string {
  return describeGrantScope(g.scope, g.sections, g.entryIds);
}

async function sendJson(url: string, method: "POST" | "PATCH", body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error ?? "No se pudo completar la operación");
  }
  return json?.data;
}

/** PATCH /api/clinical-access-grants/[id] (approve | reject | revoke | cancel). */
export function patchGrant(id: string, body: Record<string, unknown>): Promise<unknown> {
  return sendJson(`/api/clinical-access-grants/${id}`, "PATCH", body);
}

/** Fecha local YYYY-MM-DD (para inputs type="date"). */
function localDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Solicitar acceso ─────────────────────────────────────────────────────────

interface RequestAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName?: string;
  onSent?: () => void;
}

export function RequestAccessDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  onSent,
}: RequestAccessDialogProps) {
  const [scope, setScope] = useState<GrantScopeValue>("PARTIAL");
  const [sections, setSections] = useState<GrantSection[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setScope("PARTIAL");
      setSections([]);
      setReason("");
    }
  }, [open]);

  const reasonOk = reason.trim().length >= 10;
  const canSend = !saving && reasonOk && (scope === "FULL" || sections.length > 0);

  function toggle(s: GrantSection) {
    setSections((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit() {
    setSaving(true);
    try {
      await sendJson("/api/clinical-access-grants", "POST", {
        patientId,
        scope,
        ...(scope === "PARTIAL" ? { sections } : {}),
        reason: reason.trim(),
      });
      toast.success("Solicitud enviada: la van a ver los médicos tratantes");
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar la solicitud");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!saving ? onOpenChange(v) : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>Solicitar acceso a la historia clínica</DialogTitle>
          <DialogDescription>
            {patientName ? `${patientName}. ` : ""}
            La aprueba un médico tratante o el administrador, registrando el consentimiento
            del paciente. El acceso es de solo lectura, vence y queda auditado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Alcance</Label>
            <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ScopeOption
                selected={scope === "PARTIAL"}
                onSelect={() => setScope("PARTIAL")}
                title="Algunas secciones"
                description="Pedí solo lo que necesitás (recomendado)."
              />
              <ScopeOption
                selected={scope === "FULL"}
                onSelect={() => setScope("FULL")}
                title="Historia completa"
                description="Ficha completa y todos los registros de otros profesionales."
              />
            </div>
          </div>

          {scope === "PARTIAL" && (
            <div className="space-y-2">
              <Label>Secciones</Label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {GRANT_SECTIONS.map((s) => (
                  <label
                    key={s}
                    htmlFor={`grant-section-${s}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/40",
                      sections.includes(s) && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <Checkbox
                      id={`grant-section-${s}`}
                      checked={sections.includes(s)}
                      onCheckedChange={() => toggle(s)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{GRANT_SECTION_LABELS[s]}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{SECTION_HINTS[s]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="grant-reason">Motivo clínico</Label>
            <Textarea
              id="grant-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: interconsulta por dolor torácico; necesito antecedentes y evoluciones previas."
            />
            <p className="text-[11.5px] text-muted-foreground">
              Mínimo 10 caracteres. Lo ven quienes deciden la solicitud.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSend}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold">
        <span
          className={cn(
            "grid h-3.5 w-3.5 place-items-center rounded-full border",
            selected ? "border-primary" : "border-muted-foreground/40",
          )}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </span>
        {title}
      </span>
      <span className="mt-0.5 block pl-[22px] text-[11.5px] text-muted-foreground">{description}</span>
    </button>
  );
}

// ─── Aprobar (con consentimiento) ────────────────────────────────────────────

interface GrantDialogProps {
  /** Concesión sobre la que se actúa; null = cerrado. */
  grant: ClinicalAccessGrant | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

function GrantSummary({ grant }: { grant: ClinicalAccessGrant }) {
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-[12.5px]">
      <div>
        <span className="font-semibold">{userDisplayName(grant.grantedTo)}</span>
        <span className="text-muted-foreground"> · alcance: {grantScopeLabel(grant)}</span>
      </div>
      <p className="whitespace-pre-wrap text-foreground/80">“{grant.reason}”</p>
    </div>
  );
}

export function ApproveAccessDialog({ grant, onOpenChange, onDone }: GrantDialogProps) {
  const today = localDateInput(new Date());
  const [consentType, setConsentType] = useState<ConsentTypeValue | "">("");
  const [consentDate, setConsentDate] = useState(today);
  const [evidence, setEvidence] = useState("");
  const [days, setDays] = useState(String(GRANT_DEFAULT_DAYS));
  const [saving, setSaving] = useState(false);
  const grantId = grant?.id;

  useEffect(() => {
    if (grantId) {
      setConsentType("");
      setConsentDate(localDateInput(new Date()));
      setEvidence("");
      setDays(String(GRANT_DEFAULT_DAYS));
    }
  }, [grantId]);

  const daysNum = Number(days);
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= GRANT_MAX_DAYS;
  const dateOk = !!consentDate && consentDate <= today;
  const canSubmit = !saving && !!consentType && daysOk && dateOk;

  async function submit() {
    if (!grant || !consentType) return;
    setSaving(true);
    try {
      // Hoy → ahora (evita una hora "futura"); otro día → mediodía local.
      const consentAt = consentDate === today ? new Date() : new Date(`${consentDate}T12:00:00`);
      await patchGrant(grant.id, {
        action: "approve",
        consentType,
        consentEvidence: evidence.trim() || null,
        consentAt: consentAt.toISOString(),
        days: daysNum,
      });
      toast.success("Acceso concedido");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aprobar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!grant} onOpenChange={(v) => (!saving ? onOpenChange(v) : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Aprobar acceso a la historia clínica</DialogTitle>
          <DialogDescription>
            Registrá cómo dio su consentimiento el paciente (Ley 26.529 y 25.326). El acceso
            es de solo lectura y se puede revocar en cualquier momento.
          </DialogDescription>
        </DialogHeader>

        {grant && (
          <div className="space-y-4">
            <GrantSummary grant={grant} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Consentimiento del paciente</Label>
                <Select value={consentType} onValueChange={(v) => setConsentType(v as ConsentTypeValue)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Elegí el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {CONSENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grant-consent-date">Fecha del consentimiento</Label>
                <Input
                  id="grant-consent-date"
                  type="date"
                  max={today}
                  value={consentDate}
                  onChange={(e) => setConsentDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="grant-evidence">
                Evidencia <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="grant-evidence"
                rows={2}
                maxLength={2000}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Ej: firmó el formulario de consentimiento, archivado en el legajo."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="grant-days">Vigencia (días)</Label>
              <Input
                id="grant-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={GRANT_MAX_DAYS}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="max-w-[140px]"
              />
              <p className={cn("text-[11.5px]", daysOk ? "text-muted-foreground" : "text-destructive")}>
                {daysOk
                  ? `Vence el ${fmtDateAR(new Date(Date.now() + daysNum * DAY_MS))} · máximo ${GRANT_MAX_DAYS} días`
                  : `Ingresá entre 1 y ${GRANT_MAX_DAYS} días`}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aprobar acceso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rechazar / revocar ──────────────────────────────────────────────────────

interface GrantNoteDialogProps extends GrantDialogProps {
  mode: "reject" | "revoke";
}

export function GrantNoteDialog({ mode, grant, onOpenChange, onDone }: GrantNoteDialogProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const grantId = grant?.id;

  useEffect(() => {
    if (grantId) setNote("");
  }, [grantId]);

  const isReject = mode === "reject";
  const canSubmit = !saving && (!isReject || note.trim().length >= 3);
  const name = userDisplayName(grant?.grantedTo);

  async function submit() {
    if (!grant) return;
    setSaving(true);
    try {
      const decisionNote = note.trim();
      await patchGrant(
        grant.id,
        isReject
          ? { action: "reject", decisionNote }
          : { action: "revoke", ...(decisionNote ? { decisionNote } : {}) },
      );
      toast.success(isReject ? "Solicitud rechazada" : "Acceso revocado");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la operación");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!grant} onOpenChange={(v) => (!saving ? onOpenChange(v) : null)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isReject ? "Rechazar solicitud de acceso" : "Revocar acceso"}</DialogTitle>
          <DialogDescription>
            {isReject
              ? `${name} no va a poder ver la historia clínica. Indicá el motivo: lo ve quien la pidió.`
              : `El acceso de ${name} termina ahora. Podés dejar una observación.`}
          </DialogDescription>
        </DialogHeader>
        {grant && <GrantSummary grant={grant} />}
        <div className="space-y-1.5">
          <Label htmlFor="grant-note">
            {isReject ? "Motivo del rechazo" : "Observación"}
            {!isReject && <span className="font-normal text-muted-foreground"> (opcional)</span>}
          </Label>
          <Textarea
            id="grant-note"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isReject ? "Ej: el paciente no autoriza compartir su historia." : "Ej: finalizó la interconsulta."
            }
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReject ? "Rechazar" : "Revocar acceso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
