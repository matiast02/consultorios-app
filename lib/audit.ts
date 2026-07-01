import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Tamper-evidence: hash encadenado por (resource, resourceId).
function auditHash(
  prevHash: string | null,
  c: { userId: string; action: string; resource: string; resourceId: string; details: string | null }
): string {
  const payload = [prevHash ?? "", c.userId, c.action, c.resource, c.resourceId, c.details ?? ""].join("\n");
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW_SENSITIVE"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_BLOCKED"
  | "LOGOUT"
  | "PASSWORD_CHANGED";

export type AuditResource =
  | "patient"
  | "shift"
  | "evolution"
  | "clinical_record"
  | "health_insurance"
  | "specialization"
  | "user"
  | "user_preference"
  | "block_day"
  | "prescription"
  | "medication"
  | "auth";

interface LogAuditParams {
  userId: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string;
  details?: Record<string, unknown> | string;
  req?: NextRequest;
}

/**
 * Log an audit event. Fire-and-forget — never throws, never blocks.
 * Ley 25.326 compliance: all access to sensitive health data is recorded.
 */
export function logAudit({
  userId,
  action,
  resource,
  resourceId,
  details,
  req,
}: LogAuditParams): void {
  const ipAddress =
    req?.headers.get("x-forwarded-for") ??
    req?.headers.get("x-real-ip") ??
    null;
  const userAgent = req?.headers.get("user-agent") ?? null;
  const detailsStr =
    details != null ? (typeof details === "string" ? details : JSON.stringify(details)) : null;

  // Fire and forget — don't await, don't block the response
  void (async () => {
    try {
      const last = await prisma.auditLog.findFirst({
        where: { resource, resourceId },
        orderBy: { createdAt: "desc" },
        select: { hash: true },
      });
      const prevHash = last?.hash ?? null;
      const hash = auditHash(prevHash, { userId, action, resource, resourceId, details: detailsStr });

      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          details: detailsStr,
          ipAddress,
          userAgent,
          hash,
          prevHash,
        },
      });
    } catch (err) {
      console.error("[AUDIT] Failed to write audit log:", err);
    }
  })();
}

/**
 * Verify the tamper-evidence chain for a resource's audit trail.
 * Returns the first broken entry id (if any).
 */
export async function verifyAuditChain(
  resource: string,
  resourceId: string
): Promise<{ valid: boolean; brokenAtId?: string; entries: number }> {
  const rows = await prisma.auditLog.findMany({
    where: { resource, resourceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, action: true, resource: true, resourceId: true, details: true, hash: true, prevHash: true },
  });

  let expectedPrev: string | null = null;
  for (const row of rows) {
    // Legacy rows (pre-chaining) have no hash — skip until the chain starts.
    if (row.hash == null) {
      continue;
    }
    const recomputed = auditHash(expectedPrev, {
      userId: row.userId,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId,
      details: row.details ?? null,
    });
    if (row.prevHash !== expectedPrev || recomputed !== row.hash) {
      return { valid: false, brokenAtId: row.id, entries: rows.length };
    }
    expectedPrev = row.hash;
  }

  return { valid: true, entries: rows.length };
}
