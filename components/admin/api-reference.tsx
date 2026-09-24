"use client";

import type { ComponentProps } from "react";
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

type ScalarConfiguration = ComponentProps<typeof ApiReferenceReact>["configuration"];

/** Visor del documento OpenAPI (Scalar) con el tema de la app. */
export function ApiReference({ spec }: { spec: Record<string, unknown> }) {
  const { resolvedTheme } = useTheme();
  const configuration = {
    content: spec,
    layout: "modern",
    showSidebar: true,
    // Sin fuentes de fonts.scalar.com (la CSP solo permite 'self') ni la
    // barra de edición que Scalar muestra en localhost (`showToolbar` existe
    // en runtime pero todavía no en el tipo del paquete React).
    withDefaultFonts: false,
    showToolbar: "never",
    hideDarkModeToggle: true,
    forceDarkModeState: resolvedTheme === "dark" ? "dark" : "light",
    // Sin cliente de pruebas ni snippets: el documento es de lectura; para
    // probar están los tests y el smoke. Descargar el JSON sí.
    hideClientButton: true,
    hideTestRequestButton: true,
    hideDownloadButton: false,
  } as const;
  return <ApiReferenceReact configuration={configuration as unknown as ScalarConfiguration} />;
}
