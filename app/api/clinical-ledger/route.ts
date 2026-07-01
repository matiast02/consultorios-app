import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMedic, isSecretary } from "@/lib/auth-utils";
import { verifyClinicalChain, type ClinicalEntityType } from "@/lib/clinical-ledger";

const VALID_TYPES = new Set<ClinicalEntityType>([
  "evolution",
  "clinical_record",
  "prescription",
  "study_order",
  "meal_plan",
]);

// GET /api/clinical-ledger?entityType=evolution&entityId=xxx
// Devuelve el historial de versiones inmutables de un asiento + validez de la cadena.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Datos clínicos: las secretarias no acceden.
    if (await isSecretary(session.user.id)) {
      return NextResponse.json({ success: false, error: "Sin acceso a historia clínica" }, { status: 403 });
    }

    const entityType = req.nextUrl.searchParams.get("entityType") as ClinicalEntityType | null;
    const entityId = req.nextUrl.searchParams.get("entityId");

    if (!entityType || !VALID_TYPES.has(entityType) || !entityId) {
      return NextResponse.json({ success: false, error: "Parámetros inválidos" }, { status: 400 });
    }

    // Para evoluciones respetamos el aislamiento por médico autor (admin ve todo).
    if (entityType === "evolution" && (await isMedic(session.user.id))) {
      const evo = await prisma.evolution.findUnique({
        where: { id: entityId },
        select: { userId: true },
      });
      if (!evo || evo.userId !== session.user.id) {
        return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
      }
    }

    const rows = await prisma.clinicalEntryVersion.findMany({
      where: { entityType, entityId },
      orderBy: { version: "asc" },
    });

    // Resolvemos nombres de autores.
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter((id) => id && id !== "system-backfill"))];
    const users = authorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(
      users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || "Profesional"])
    );

    const versions = rows.map((r) => ({
      version: r.version,
      action: r.action,
      authorId: r.authorId,
      authorName: r.authorId === "system-backfill" ? "Sistema (migración)" : nameById.get(r.authorId) ?? "Profesional",
      reason: r.reason,
      data: safeParse(r.data),
      createdAt: r.createdAt,
    }));

    const integrity = await verifyClinicalChain(entityType, entityId);

    return NextResponse.json({ success: true, data: { versions, integrity } });
  } catch (error) {
    console.error("GET /api/clinical-ledger error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener el historial" }, { status: 500 });
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
