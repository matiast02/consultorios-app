import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Tamper-evidence: hash encadenado por (resource, resourceId).
function auditHash(
  prevHash: string | null,
  c: { userId: string | null; action: string; resource: string; resourceId: string; details: string | null }
): string {
  const payload = [prevHash ?? "", c.userId ?? "", c.action, c.resource, c.resourceId, c.details ?? ""].join("\n");
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
  | "PASSWORD_CHANGED"
  | "EXPORT_HC" // copia de la historia clínica entregada
  | "GRANT_ACCESS" // concesión de acceso a la HC aprobada / revocada
  | "REQUEST_ACCESS"; // solicitud de acceso a la HC creada / rechazada

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
  | "study_order"
  | "meal_plan"
  | "clinical_ledger"
  | "export"
  | "admin_dashboard"
  | "medication"
  | "auth"
  | "clinical_access_grant"
  | "hc_copy_request";

/** Largo máximo de columnas String sin @db.Text en MySQL (VARCHAR(191)). */
const MAX_VARCHAR = 191;

/**
 * IP del cliente: primer valor de x-forwarded-for (el cliente original; el
 * resto son proxies), o x-real-ip. Recortada para que un header enorme o
 * manipulado no haga fallar el insert.
 */
function clientIp(req: Pick<Request, "headers"> | null | undefined): string | null {
  if (!req) return null;
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim() || null;
  return ip ? ip.slice(0, MAX_VARCHAR) : null;
}

interface LogAuditParams {
  /** null cuando el actor es desconocido (p.ej. login fallido con email inexistente). */
  userId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string;
  details?: Record<string, unknown> | string;
  /** NextRequest, Request (hooks de Better Auth) o cualquier objeto con headers. */
  req?: Pick<Request, "headers"> | null;
}

/**
 * Log an audit event. Fire-and-forget — never throws, never blocks.
 * Ley 25.326 compliance: all access to sensitive health data is recorded.
 */
export function logAudit({
  userId,
  action,
  resource,
  resourceId: rawResourceId,
  details,
  req,
}: LogAuditParams): void {
  // resourceId puede venir de input del usuario (p.ej. email en login fallido):
  // se acota para que el insert no falle y el evento no se pierda.
  const resourceId = rawResourceId.slice(0, MAX_VARCHAR);
  const ipAddress = clientIp(req);
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
