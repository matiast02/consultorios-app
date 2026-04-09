"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { logError } from "@/lib/error-logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, { boundary: "global" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">Algo salio mal</h1>
        <p className="text-muted-foreground">
          Ocurrio un error inesperado. Podes intentar de nuevo o volver al inicio.
        </p>
        {error.message && (
          <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3 text-left break-words">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="text-xs text-muted-foreground/60">
            ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default">
            Intentar de nuevo
          </Button>
          <Button
            onClick={() => (window.location.href = "/dashboard")}
            variant="outline"
          >
            Ir al inicio
          </Button>
        </div>
      </div>
    </div>
  );
}
