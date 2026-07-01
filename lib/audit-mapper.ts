import type { AuditEvent, AuditAction, AuditSeverity } from "@/types";

/**
 * Shared shape for an audit-log row coming back from Prisma, with the
 * user + first role joined in for display.
 *
 * The full `AuditLog` Prisma type is wider than what we need here, so we
 * accept a structurally-compatible subset to make the helper reusable
 * across endpoints.
 */
export interface AuditLogWithUser {
  id: string;
  createdAt: Date;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: string | null;
  user?: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    roles?: Array<{ role: { name: string } }>;
  } | null;
}

/**
 * Build a display-friendly user name from firstName + lastName, falling
 * back to `name` and finally null.
 */
function buildUserName(
  user: AuditLogWithUser["user"] | undefined,
): string | null {
  if (!user) return null;
  const full = [user.firstName ?? "", user.lastName ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return full || user.name || null;
}

const SENSITIVE_DELETE_RESOURCES = new Set([
  "patient",
  "clinical_record",
  "evolution",
  "prescription",
]);

/**
 * Derive a UI severity classification for an audit event.
 *
 * - critical: LOGIN_BLOCKED, or DELETE on patient/clinical_record/evolution/prescription
 * - warn: LOGIN_FAILED, VIEW_SENSITIVE
 * - info: everything else
 */
export function deriveSeverity(
  action: string,
  resource: string,
): AuditSeverity {
  if (action === "LOGIN_BLOCKED") return "critical";
  if (action === "DELETE" && SENSITIVE_DELETE_RESOURCES.has(resource))
    return "critical";
  if (action === "LOGIN_FAILED" || action === "VIEW_SENSITIVE") return "warn";
  return "info";
}

/**
 * Map a Prisma AuditLog row (with user + roles) to the contract-facing
 * `AuditEvent` shape.
 */
export function toAuditEvent(log: AuditLogWithUser): AuditEvent {
  return {
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userId: log.userId ?? null,
    userName: buildUserName(log.user ?? null),
    userRole: log.user?.roles?.[0]?.role?.name ?? null,
    action: log.action as AuditAction,
    resource: log.resource,
    resourceId: log.resourceId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    details: log.details,
    severity: deriveSeverity(log.action, log.resource),
  };
}
