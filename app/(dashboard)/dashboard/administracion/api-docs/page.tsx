import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getSession } from "@/auth";
import { buildOpenApiDocument, summarize } from "@/lib/openapi/document";
import { API_VERSION } from "@/lib/openapi/info";
import { ApiReference } from "@/components/admin/api-reference";

export const dynamic = "force-dynamic";

// Referencia de la API generada del código actual. Solo admin (el layout de
// administración también deja pasar a la secretaria; acá se restringe).
export default async function ApiDocsPage() {
  const session = await getSession();
  if (session?.user?.role !== "admin") redirect("/dashboard");

  // Objeto plano para el componente cliente.
  const spec = JSON.parse(JSON.stringify(buildOpenApiDocument())) as Record<string, unknown>;
  const s = summarize();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookOpen className="h-6 w-6 text-primary" aria-hidden />
            Referencia de la API
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Versión {API_VERSION} · {s.paths} rutas · {s.operations} operaciones · {s.mobile} marcadas para la app
            móvil. Generada del código de este servidor; el archivo versionado es{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">contracts/openapi.json</code> (
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">pnpm api:docs</code>).
          </p>
        </div>
      </div>
      <div className="min-h-[70vh] overflow-hidden rounded-xl border bg-card">
        <ApiReference spec={spec} />
      </div>
    </div>
  );
}
