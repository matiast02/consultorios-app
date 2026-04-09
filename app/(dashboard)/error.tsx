"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { logError } from "@/lib/error-logger";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, { boundary: "dashboard" });
  }, [error]);

  return (
    // This renders inside the dashboard <main> (see layout.tsx), so NavBar
    // and Sidebar remain visible. We only need to fill the content area.
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
        </div>
        <h2 className="text-xl font-semibold">Algo salio mal</h2>
        <p className="text-sm text-muted-foreground">
          Ocurrio un error inesperado en esta seccion. Podes intentar de nuevo o
          volver al panel principal.
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
          <Button onClick={reset} variant="default" size="sm">
            Intentar de nuevo
          </Button>
          <Button
            onClick={() => (window.location.href = "/dashboard")}
            variant="outline"
            size="sm"
          >
            Ir al panel principal
          </Button>
        </div>
      </div>
    </div>
  );
}
