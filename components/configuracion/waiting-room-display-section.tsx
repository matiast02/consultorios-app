"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, KeyRound, Loader2, MonitorPlay, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModuleConfig } from "@/types";

// Configuración → Consultorio (admin): clave de la pantalla de la sala de
// espera (módulo waiting_room). La clave se muestra una sola vez, al generarla.

interface KeyStatus {
  configured: boolean;
  createdAt: string | null;
}

interface IssuedKey {
  key: string;
  url: string;
}

export function WaitingRoomDisplaySection() {
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [modRes, keyRes] = await Promise.all([fetch("/api/modules"), fetch("/api/admin/waiting-room-display-key")]);
      if (modRes.ok) {
        const json = await modRes.json();
        const mod = (json.data as ModuleConfig[] | undefined)?.find((m) => m.module === "waiting_room");
        setModuleEnabled(mod?.enabled ?? false);
      }
      if (keyRes.ok) {
        const json = await keyRes.json();
        setStatus(json.data ?? { configured: false, createdAt: null });
      }
    } catch {
      // se muestra el estado desconocido
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/waiting-room-display-key", { method: "POST" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setIssued({ key: json.data.key, url: json.data.url });
      toast.success(status?.configured ? "Clave rotada: la pantalla anterior dejó de funcionar" : "Clave generada");
      await load();
    } catch {
      toast.error("No se pudo generar la clave");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm("¿Revocar la clave? El televisor va a dejar de mostrar los llamados hasta que generes una nueva.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/waiting-room-display-key", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setIssued(null);
      toast.success("Clave revocada");
      await load();
    } catch {
      toast.error("No se pudo revocar la clave");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar; seleccioná el texto y copialo a mano");
    }
  }

  if (moduleEnabled === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-primary" /> Pantalla de sala de espera
          </CardTitle>
          <CardDescription>
            El módulo «Sala de espera y llamado» está apagado. Activalo en Administración → Módulos para
            entregar números de sala, llamar a consultorio y usar la pantalla del televisor.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorPlay className="h-4 w-4 text-primary" /> Pantalla de sala de espera
        </CardTitle>
        <CardDescription>
          Abrí el link en el navegador del televisor y guardalo como marcador. La pantalla muestra el número
          llamado y el consultorio, nunca nombres. La clave se ve una sola vez: si se pierde, generá otra.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {status === null ? (
              <span className="text-muted-foreground">Consultando…</span>
            ) : status.configured ? (
              <span>
                Clave configurada
                {status.createdAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    · desde el {new Date(status.createdAt).toLocaleDateString("es-AR")}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin clave: la pantalla todavía no funciona.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {status?.configured ? "Rotar clave" : "Generar clave"}
            </Button>
            {status?.configured && (
              <Button type="button" size="sm" variant="outline" onClick={revoke} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Revocar
              </Button>
            )}
          </div>
        </div>

        {issued && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="text-sm font-semibold">Link para el televisor (se muestra una sola vez)</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={issued.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border bg-card px-3 py-1.5 font-mono text-xs"
              />
              <Button type="button" size="sm" variant="outline" onClick={() => copy(issued.url)}>
                <Copy className="h-4 w-4" /> Copiar
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={issued.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Abrir pantalla
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Al abrirlo, la pantalla guarda la clave y la quita de la dirección. En el televisor tocá «Activar
              sonido» una vez para que suene la campanilla en cada llamado.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
