import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { buildOpenApiDocument } from "@/lib/openapi/document";

// GET /api/docs/openapi.json — Documento OpenAPI generado del código actual.
// Solo admin: el documento describe toda la superficie de la API. Para el
// cliente de la app se usa el archivo versionado contracts/openapi.json.
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ success: false, error: "Solo administradores" }, { status: 403 });
  }
  return NextResponse.json(buildOpenApiDocument(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
