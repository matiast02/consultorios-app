"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import "@scalar/api-reference-react/style.css";

// Scalar se carga solo en el cliente (usa window) y empaquetado localmente:
// la CSP permite scripts únicamente de nuestro origen.
const ApiReferenceReact = dynamic(
  () => import("@scalar/api-reference-react").then((m) => m.ApiReferenceReact),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm text-muted-foreground">Cargando la referencia…</p>,
  },
);

/** Visor del documento OpenAPI (Scalar) con el tema de la app. */
export function ApiReference({ spec }: { spec: Record<string, unknown> }) {
  const { resolvedTheme } = useTheme();
  return (
    <ApiReferenceReact
      configuration={{
        content: spec,
        layout: "modern",
        showSidebar: true,
        hideDarkModeToggle: true,
        forceDarkModeState: resolvedTheme === "dark" ? "dark" : "light",
        // Sin cliente de pruebas ni snippets: el documento es de lectura; para
        // probar están los tests y el smoke. Descargar el JSON sí.
        hideClientButton: true,
        hideTestRequestButton: true,
        hideDownloadButton: false,
      }}
    />
  );
}
