import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { verifyClinicalChain, type ClinicalEntityType } from "@/lib/clinical-ledger";
import { verifyAuditChain } from "@/lib/audit";

const AUDIT_CHAIN_LIMIT = 1000; // cota defensiva

// GET /api/admin/integrity — verifica las cadenas de hash del ledger clínico y
// de la auditoría, y reporta cualquier manipulación detectada. Solo admin.
export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if ((await getUserRole(session.user.id)) !== "admin") {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    // ── Ledger clínico: una cadena por (entityType, entityId) ──
    const clinicalGroups = await prisma.clinicalEntryVersion.groupBy({
      by: ["entityType", "entityId"],
    });

    let clinicalOk = 0;
    const clinicalBroken: { entityType: string; entityId: string; brokenAtVersion?: number }[] = [];
    for (const g of clinicalGroups) {
      const r = await verifyClinicalChain(g.entityType as ClinicalEntityType, g.entityId);
      if (r.valid) clinicalOk++;
      else clinicalBroken.push({ entityType: g.entityType, entityId: g.entityId, brokenAtVersion: r.brokenAtVersion });
    }

    // ── AuditLog: una cadena por (resource, resourceId), acotado ──
    const auditGroups = await prisma.auditLog.groupBy({
      by: ["resource", "resourceId"],
      orderBy: { resourceId: "asc" },
      take: AUDIT_CHAIN_LIMIT,
    });

    let auditOk = 0;
    const auditBroken: { resource: string; resourceId: string; brokenAtId?: string }[] = [];
    for (const g of auditGroups) {
      const r = await verifyAuditChain(g.resource, g.resourceId);
      if (r.valid) auditOk++;
      else auditBroken.push({ resource: g.resource, resourceId: g.resourceId, brokenAtId: r.brokenAtId });
    }

    const allValid = clinicalBroken.length === 0 && auditBroken.length === 0;

    return NextResponse.json({
      success: true,
      data: {
        allValid,
        clinical: {
          chains: clinicalGroups.length,
          valid: clinicalOk,
          broken: clinicalBroken,
        },
        audit: {
          chains: auditGroups.length,
          valid: auditOk,
          broken: auditBroken,
          capped: auditGroups.length >= AUDIT_CHAIN_LIMIT,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/admin/integrity error:", error);
    return NextResponse.json({ success: false, error: "Error al verificar integridad" }, { status: 500 });
  }
}
