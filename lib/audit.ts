import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "VIEW_SENSITIVE";

export type AuditResource =
  | "patient"
  | "shift"
  | "evolution"
  | "clinical_record"
  | "health_insurance"
  | "specialization"
  | "user"
  | "user_preference"
  | "block_day";

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

  // Fire and forget — don't await, don't block the response
  prisma.auditLog
    .create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details:
          details != null
            ? typeof details === "string"
              ? details
              : JSON.stringify(details)
            : null,
        ipAddress,
        userAgent,
      },
    })
    .catch((err) => {
      console.error("[AUDIT] Failed to write audit log:", err);
    });
}
