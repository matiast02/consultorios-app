"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldAlert, PlusCircle, PencilLine, Ban } from "lucide-react";

interface LedgerVersion {
  version: number;
  action: "created" | "corrected" | "annulled" | string;
  authorName: string;
  reason: string | null;
  data: Record<string, unknown> | unknown;
  createdAt: string;
}

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string | null;
  title?: string;
}

const ACTION_META: Record<string, { label: string; icon: typeof PlusCircle; className: string }> = {
  created: { label: "Creación", icon: PlusCircle, className: "bg-primary/10 text-primary" },
  corrected: { label: "Corrección", icon: PencilLine, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  annulled: { label: "Anulación", icon: Ban, className: "bg-destructive/10 text-destructive" },
};

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  title = "Historial de versiones",
}: VersionHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<LedgerVersion[]>([]);
  const [integrity, setIntegrity] = useState<{ valid: boolean; brokenAtVersion?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entityId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/clinical-ledger?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json?.success) {
          setVersions(json.data.versions ?? []);
          setIntegrity(json.data.integrity ?? null);
        } else {
          setError(json?.error ?? "No se pudo cargar el historial");
        }
      })
      .catch(() => active && setError("Error de conexión"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, entityType, entityId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Registro inmutable de cambios. Cada versión se conserva y la cadena está protegida
            contra manipulación.
          </DialogDescription>
        </DialogHeader>

        {integrity && (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              integrity.valid
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {integrity.valid ? (
              <>
                <ShieldCheck className="h-4 w-4" /> Integridad verificada — cadena intacta
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4" /> Integridad comprometida (versión{" "}
                {integrity.brokenAtVersion})
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin versiones registradas.</p>
        ) : (
          <ol className="space-y-3">
            {[...versions].reverse().map((v) => {
              const meta = ACTION_META[v.action] ?? {
                label: v.action,
                icon: PencilLine,
                className: "bg-muted text-muted-foreground",
              };
              const Icon = meta.icon;
              return (
                <li key={v.version} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tabular-nums text-muted-foreground">
                      v{v.version}
                    </span>
                    <Badge variant="secondary" className={meta.className}>
                      <Icon className="mr-1 h-3 w-3" />
                      {meta.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{v.authorName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{fmt(v.createdAt)}</span>
                  </div>
                  {v.reason && (
                    <p className="mt-2 text-sm">
                      <span className="text-muted-foreground">Motivo: </span>
                      {v.reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
