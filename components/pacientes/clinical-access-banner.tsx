"use client";

// Banner de acceso a la HC en las tabs clínicas de la ficha del paciente, para
// un médico que NO es tratante:
// - concesión vigente → aviso discreto (vence, alcance, solo lectura);
// - solicitud pendiente → estado + "Cancelar solicitud";
// - nada → "No tenés acceso…" + "Solicitar acceso".
// Tratantes y admin no ven banner (acceso propio).

import { useState } from "react";
import { toast } from "sonner";
import { Clock, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeGrantScope } from "@/lib/clinical-grants-shared";
import type { ClinicalAccessStatus } from "@/types";
import { RequestAccessDialog, patchGrant } from "./access-grant-dialogs";
import { fmtDateAR } from "./shared";

interface ClinicalAccessBannerProps {
  status: ClinicalAccessStatus;
  patientId: string;
  patientName?: string;
  /** Se llama tras solicitar / cancelar, para recargar la ficha. */
  onChanged: () => void;
  className?: string;
}

const scopeText = (scope: "FULL" | "PARTIAL", sections: string[], entryIds: string[] = []) =>
  describeGrantScope(scope, sections, entryIds).toLocaleLowerCase("es-AR");

export function ClinicalAccessBanner({
  status,
  patientId,
  patientName,
  onChanged,
  className,
}: ClinicalAccessBannerProps) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (status.hasRelationship) return null;

  if (status.activeGrant) {
    const g = status.activeGrant;
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-sky-200 bg-sky-50/70 px-3.5 py-2 text-[12.5px] text-sky-900",
          "dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200",
          className,
        )}
      >
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>
          Acceso concedido hasta <strong className="font-semibold">{fmtDateAR(new Date(g.expiresAt))}</strong>
          {" · "}alcance {scopeText(g.scope, g.sections, g.entryIds)}
        </span>
        <Badge variant="secondary" className="ml-auto bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/50 dark:text-sky-200">
          Solo lectura
        </Badge>
      </div>
    );
  }

  const pending = status.pendingRequest;

  async function cancelRequest() {
    if (!pending) return;
    setCancelling(true);
    try {
      await patchGrant(pending.id, { action: "cancel" });
      toast.success("Solicitud cancelada");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar la solicitud");
    } finally {
      setCancelling(false);
    }
  }

  if (pending) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-start gap-3 rounded-[10px] border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900",
          "dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
          className,
        )}
      >
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">Solicitud de acceso pendiente</p>
          <p className="mt-0.5 text-[12.5px] opacity-90">
            Enviada el {fmtDateAR(new Date(pending.createdAt))} · alcance{" "}
            {scopeText(pending.scope, pending.sections)}. La tiene que aprobar un médico tratante o el
            administrador, con el consentimiento del paciente. Mientras tanto ves solo tus registros y
            las alergias.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 bg-background/70"
          onClick={cancelRequest}
          disabled={cancelling}
        >
          {cancelling && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Cancelar solicitud
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-start gap-3 rounded-[10px] border bg-muted/40 px-4 py-3", className)}>
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold">No tenés acceso a la historia clínica de este paciente</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Ves solo tus propios registros y las alergias. Para ver el resto, pedí acceso: lo aprueba un
          médico tratante o el administrador, con el consentimiento del paciente.
        </p>
      </div>
      {status.canRequest && (
        <Button size="sm" className="h-8" onClick={() => setRequestOpen(true)}>
          Solicitar acceso
        </Button>
      )}
      <RequestAccessDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        patientId={patientId}
        patientName={patientName}
        onSent={onChanged}
      />
    </div>
  );
}
