"use client";

// Panel "Accesos a la historia clínica" (ficha del paciente, tab Datos) para
// médicos tratantes y admin: solicitudes pendientes (aprobar con
// consentimiento / rechazar), accesos vigentes (revocar) e historial.
// Las acciones visibles salen de `permissions` que calcula la API.

import { useState } from "react";
import { Ban, Check, ChevronDown, ChevronUp, Loader2, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { CONSENT_TYPE_LABELS, GRANT_STATUS_LABELS } from "@/lib/clinical-grants-shared";
import type { ClinicalAccessGrant, ClinicalGrantStatus } from "@/types";
import {
  ApproveAccessDialog,
  GrantNoteDialog,
  grantScopeLabel,
  userDisplayName,
} from "./access-grant-dialogs";
import { SectionHead, fmtDateAR } from "./shared";

const STATUS_TONE: Record<ClinicalGrantStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300",
  REJECTED: "bg-destructive/10 text-destructive hover:bg-destructive/10",
  REVOKED: "bg-muted text-muted-foreground hover:bg-muted",
  EXPIRED: "bg-muted text-muted-foreground hover:bg-muted",
};

const d = (iso: string | null) => (iso ? fmtDateAR(new Date(iso)) : "—");

function grantMeta(g: ClinicalAccessGrant): string {
  switch (g.status) {
    case "PENDING":
      return `Solicitada el ${d(g.createdAt)}`;
    case "ACTIVE":
      return [
        `Vigente hasta el ${d(g.expiresAt)}`,
        g.consentType ? `consentimiento ${CONSENT_TYPE_LABELS[g.consentType].toLocaleLowerCase("es-AR")}` : null,
        g.decidedBy ? `aprobó ${userDisplayName(g.decidedBy)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "REJECTED":
      return g.decidedById === g.grantedToUserId
        ? `Cancelada por quien la pidió el ${d(g.decidedAt)}`
        : `Rechazada el ${d(g.decidedAt)}${g.decidedBy ? ` por ${userDisplayName(g.decidedBy)}` : ""}`;
    case "REVOKED":
      return g.revokedById === g.grantedToUserId
        ? `Renunciada por el profesional el ${d(g.revokedAt)}`
        : `Revocada el ${d(g.revokedAt)}${g.revokedBy ? ` por ${userDisplayName(g.revokedBy)}` : ""}`;
    case "EXPIRED":
      return `Venció el ${d(g.expiresAt)}`;
  }
}

interface AccessGrantsPanelProps {
  patientId: string;
  /** Tras aprobar / rechazar / revocar (p. ej. para refrescar contadores). */
  onChanged?: () => void;
}

export function AccessGrantsPanel({ patientId, onChanged }: AccessGrantsPanelProps) {
  const { data, isLoading, error, refresh } = useCachedFetch<ClinicalAccessGrant[]>(
    `/api/clinical-access-grants?patientId=${encodeURIComponent(patientId)}`,
  );
  const [approveTarget, setApproveTarget] = useState<ClinicalAccessGrant | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ mode: "reject" | "revoke"; grant: ClinicalAccessGrant } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const grants = Array.isArray(data) ? data : [];
  const pending = grants.filter((g) => g.status === "PENDING");
  const active = grants.filter((g) => g.status === "ACTIVE");
  const history = grants.filter((g) => g.status !== "PENDING" && g.status !== "ACTIVE");

  function done() {
    void refresh();
    onChanged?.();
  }

  return (
    <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
      <SectionHead
        icon={ShieldCheck}
        title="Accesos a la historia clínica"
        description="Pedidos de otros profesionales y accesos concedidos. Cada acceso requiere el consentimiento del paciente y queda auditado."
        actions={
          pending.length > 0 ? (
            <Badge className={STATUS_TONE.PENDING}>
              {pending.length} {pending.length === 1 ? "pendiente" : "pendientes"}
            </Badge>
          ) : undefined
        }
      />

      <div className="space-y-4 px-6 pt-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            No se pudieron cargar las solicitudes de acceso.
          </p>
        ) : (
          <>
            {pending.length === 0 && active.length === 0 && (
              <p className="py-3 text-center text-sm text-muted-foreground">
                No hay solicitudes pendientes ni accesos vigentes.
              </p>
            )}

            {pending.length > 0 && (
              <GrantGroup title="Pendientes de decisión">
                {pending.map((g) => (
                  <GrantRow key={g.id} grant={g}>
                    {g.permissions.approve && (
                      <Button size="sm" className="h-8" onClick={() => setApproveTarget(g)}>
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        Aprobar
                      </Button>
                    )}
                    {g.permissions.reject && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setNoteTarget({ mode: "reject", grant: g })}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Rechazar
                      </Button>
                    )}
                  </GrantRow>
                ))}
              </GrantGroup>
            )}

            {active.length > 0 && (
              <GrantGroup title="Accesos vigentes">
                {active.map((g) => (
                  <GrantRow key={g.id} grant={g}>
                    {g.permissions.revoke && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setNoteTarget({ mode: "revoke", grant: g })}
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" />
                        Revocar
                      </Button>
                    )}
                  </GrantRow>
                ))}
              </GrantGroup>
            )}

            {history.length > 0 && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[12px] text-muted-foreground"
                  onClick={() => setShowHistory((v) => !v)}
                >
                  {showHistory ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
                  {showHistory ? "Ocultar historial" : `Ver historial (${history.length})`}
                </Button>
                {showHistory && (
                  <div className="mt-2 space-y-2">
                    {history.map((g) => (
                      <GrantRow key={g.id} grant={g} muted />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ApproveAccessDialog
        grant={approveTarget}
        onOpenChange={(v) => !v && setApproveTarget(null)}
        onDone={done}
      />
      <GrantNoteDialog
        mode={noteTarget?.mode ?? "reject"}
        grant={noteTarget?.grant ?? null}
        onOpenChange={(v) => !v && setNoteTarget(null)}
        onDone={done}
      />
    </Card>
  );
}

function GrantGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function GrantRow({
  grant: g,
  muted,
  children,
}: {
  grant: ClinicalAccessGrant;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-3 rounded-xl border bg-card px-4 py-3", muted && "opacity-80")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <strong className="font-semibold">{userDisplayName(g.grantedTo)}</strong>
          <Badge variant="secondary" className={STATUS_TONE[g.status]}>
            {GRANT_STATUS_LABELS[g.status]}
          </Badge>
          <span className="text-[12px] text-muted-foreground">Alcance: {grantScopeLabel(g)}</span>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">{grantMeta(g)}</p>
        {g.reason && (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-foreground/80">“{g.reason}”</p>
        )}
        {g.decisionNote && g.status !== "ACTIVE" && g.status !== "PENDING" && (
          <p className="mt-1 text-[12px] text-muted-foreground">Nota: {g.decisionNote}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{children}</div>}
    </div>
  );
}
