import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { verifyClinicalChain, type ClinicalEntityType } from "@/lib/clinical-ledger";
import {
  CLINICAL_FORBIDDEN,
  attachmentEntryRef,
  canReadEntry,
  findActiveGrant,
  getClinicalActor,
  grantAuditDetails,
  medicHasRelationship,
  type ClinicalActor,
  type EntryReadResult,
} from "@/lib/clinical-access";

const VALID_TYPES = new Set<ClinicalEntityType>([
  "evolution",
  "clinical_record",
  "prescription",
  "study_order",
  "meal_plan",
  "attachment",
]);

const DENY: EntryReadResult = { ok: false };

/**
 * ¿Puede el actor ver el historial de este asiento? Médico: asientos propios o
 * cubiertos por una concesión vigente sobre el paciente DUEÑO del asiento; la
 * ficha, si es tratante o tiene concesión FULL (sus versiones son snapshots
 * completos: una PARTIAL las filtraría). Admin: todo, incluso si la entidad ya
 * no existe (el ledger la sobrevive).
 */
async function canViewLedger(
  actor: ClinicalActor,
  entityType: ClinicalEntityType,
  entityId: string,
): Promise<EntryReadResult> {
  if (actor.isAdmin) return { ok: true };
  const byId = { where: { id: entityId }, select: { id: true, userId: true, patientId: true } } as const;
  switch (entityType) {
    case "evolution": {
      const e = await prisma.evolution.findUnique({
        where: { id: entityId },
        select: { id: true, userId: true, clinicalRecord: { select: { patientId: true } } },
      });
      return e ? canReadEntry(actor, e, e.clinicalRecord?.patientId, "evolution") : DENY;
    }
    case "prescription": {
      const e = await prisma.prescription.findUnique(byId);
      return e ? canReadEntry(actor, e, e.patientId, "prescription") : DENY;
    }
    case "study_order": {
      const e = await prisma.studyOrder.findUnique(byId);
      return e ? canReadEntry(actor, e, e.patientId, "study_order") : DENY;
    }
    case "meal_plan": {
      const e = await prisma.mealPlan.findUnique(byId);
      return e ? canReadEntry(actor, e, e.patientId, "meal_plan") : DENY;
    }
    case "attachment": {
      const a = await prisma.clinicalAttachment.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          uploadedById: true,
          entityType: true,
          entityId: true,
          patientId: true,
          annulledAt: true,
        },
      });
      if (!a) return DENY;
      // Un adjunto anulado ajeno no existe para quien lee por concesión.
      if (a.annulledAt && a.uploadedById !== actor.userId) return DENY;
      return canReadEntry(actor, attachmentEntryRef(a), a.patientId, "attachment");
    }
    case "clinical_record": {
      const r = await prisma.clinicalRecord.findUnique({
        where: { id: entityId },
        select: { patientId: true },
      });
      if (!r) return DENY;
      if (await medicHasRelationship(actor, r.patientId)) return { ok: true };
      const grant = await findActiveGrant(actor.userId, r.patientId);
      return grant?.scope === "FULL" ? { ok: true, grantId: grant.id } : DENY;
    }
    default:
      return DENY;
  }
}

// GET /api/clinical-ledger?entityType=evolution&entityId=xxx
// Devuelve el historial de versiones inmutables de un asiento + validez de la cadena.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Datos clínicos: lista blanca de roles.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const entityType = req.nextUrl.searchParams.get("entityType") as ClinicalEntityType | null;
    const entityId = req.nextUrl.searchParams.get("entityId");

    if (!entityType || !VALID_TYPES.has(entityType) || !entityId) {
      return NextResponse.json({ success: false, error: "Parámetros inválidos" }, { status: 400 });
    }

    // Aislamiento por autor (o concesión) para TODOS los tipos (404 para no revelar existencia).
    const access = await canViewLedger(actor, entityType, entityId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
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

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "clinical_ledger",
      resourceId: entityId,
      details: { entityType, versions: versions.length, ...grantAuditDetails(access.grantId) },
      req,
    });

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
