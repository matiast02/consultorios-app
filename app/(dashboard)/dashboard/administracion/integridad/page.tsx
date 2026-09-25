"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert, Loader2, RefreshCw } from "lucide-react";

interface IntegrityResult {
  allValid: boolean;
  clinical: {
    chains: number;
    valid: number;
    broken: { entityType: string; entityId: string; brokenAtVersion?: number }[];
  };
  audit: {
    chains: number;
    valid: number;
    broken: { resource: string; resourceId: string; brokenAtId?: string }[];
    capped: boolean;
  };
}

export default function IntegridadPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntegrityResult | null>(null);

  async function runCheck() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integrity");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Error al verificar");
      setResult(json.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al verificar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integridad de la historia clínica</h1>
          <p className="text-muted-foreground">
            Verifica las cadenas de hash de los asientos clínicos y de la auditoría para detectar
            manipulación de registros.
          </p>
        </div>
        <Button onClick={runCheck} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {result ? "Volver a verificar" : "Verificar integridad"}
        </Button>
      </div>

      {result && (
        <>
          <Card
            className={
              result.allValid
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-destructive/40 bg-destructive/5"
            }
          >
            <CardContent className="flex items-center gap-3 py-5">
              {result.allValid ? (
                <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert className="h-8 w-8 text-destructive" />
              )}
              <div>
                <p className="text-lg font-semibold">
                  {result.allValid
                    ? "Integridad verificada"
                    : "Se detectó manipulación de registros"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.allValid
                    ? "Todas las cadenas de hash están intactas."
                    : "Una o más cadenas fueron alteradas fuera de la aplicación."}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <ChainCard
              title="Asientos clínicos"
              total={result.clinical.chains}
              valid={result.clinical.valid}
              brokenCount={result.clinical.broken.length}
            />
            <ChainCard
              title="Auditoría"
              total={result.audit.chains}
              valid={result.audit.valid}
              brokenCount={result.audit.broken.length}
              note={result.audit.capped ? "Verificación limitada a las primeras 1000 cadenas." : undefined}
            />
          </div>

          {!result.allValid && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive">Cadenas comprometidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {result.clinical.broken.map((b) => (
                  <div key={`c-${b.entityId}`} className="font-mono text-xs">
                    clínico · {b.entityType} · {b.entityId}
                    {b.brokenAtVersion ? ` (v${b.brokenAtVersion})` : ""}
                  </div>
                ))}
                {result.audit.broken.map((b) => (
                  <div key={`a-${b.resourceId}`} className="font-mono text-xs">
                    auditoría · {b.resource} · {b.resourceId}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ChainCard({
  title,
  total,
  valid,
  brokenCount,
  note,
}: {
  title: string;
  total: number;
  valid: number;
  brokenCount: number;
  note?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{valid}</span>
          <span className="text-sm text-muted-foreground">/ {total} cadenas íntegras</span>
        </div>
        {brokenCount > 0 && (
          <p className="mt-1 text-sm font-medium text-destructive">
            {brokenCount} comprometida{brokenCount === 1 ? "" : "s"}
          </p>
        )}
        {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}
