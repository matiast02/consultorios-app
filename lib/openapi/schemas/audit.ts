// DTO del audit log (lib/audit.ts) compartidos por el registro OpenAPI:
// el feed del dashboard de admin, /api/audit/recent y /api/audit-logs.
// La forma es la que DEVUELVEN las rutas (serializador toAuditEvent).

import { z } from "zod";
import { IsoDateTime } from "../registry";

export const AuditActionSchema = z
  .enum([
    "CREATE",
    "UPDATE",
    "DELETE",
    "VIEW_SENSITIVE",
    "LOGIN_SUCCESS",
    "LOGIN_FAILED",
    "LOGIN_BLOCKED",
    "LOGOUT",
    "PASSWORD_CHANGED",
    "EXPORT_HC",
    "GRANT_ACCESS",
    "REQUEST_ACCESS",
  ])
  .openapi({ ref: "AuditAction", description: "Acciones registradas en el audit log (lib/audit.ts)." });

export const AuditSeveritySchema = z
  .enum(["info", "warn", "critical"])
  .openapi({
    ref: "AuditSeverity",
    description: "Derivada para la UI: critical = LOGIN_BLOCKED o DELETE sobre paciente/HC/asientos clínicos; warn = LOGIN_FAILED o VIEW_SENSITIVE; info = el resto.",
  });

export const AuditEventSchema = z
  .object({
    id: z.string(),
    createdAt: IsoDateTime,
    userId: z.string().nullable().describe("null en eventos sin usuario (login fallido de email desconocido, sistema)."),
    userName: z.string().nullable().describe("Nombre y apellido (o `name`) del usuario, si existe."),
    userRole: z.string().nullable().describe("Primer rol del usuario (medic, secretary, admin)."),
    action: AuditActionSchema,
    resource: z.string().describe('Tipo de recurso: "patient", "shift", "clinical_record", "admin_dashboard", …'),
    resourceId: z.string(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    details: z.string().nullable().describe("JSON serializado con ids y metadatos. Nunca contenido clínico."),
    severity: AuditSeveritySchema,
  })
  .openapi({ ref: "AuditEvent" });
