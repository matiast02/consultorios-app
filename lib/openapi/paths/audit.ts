// Auditoría e integridad: /api/audit-logs, /api/audit/recent, /api/admin/integrity.
// Solo admin; ninguna la usa la app móvil.

import { z } from "zod";
import { auditLogsQuerySchema } from "@/lib/validations";
import { defineRoutes, errors, IsoDateTime, ok, okPaginated, TAGS } from "../registry";
import { AuditLogSchema, AuditRecentSchema, IntegrityReportSchema } from "../schemas/admin";

export const auditRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/audit-logs",
    summary: "Audit log paginado (filas crudas)",
    description: [
      "Listado paginado del `AuditLog` con el usuario actor, más nuevos primero. Filtros exactos por `userId`, `resource` y `action`;",
      "`from` / `to` se interpretan con `new Date()` (acepta `YYYY-MM-DD` o ISO) y `to` incluye el día completo.",
      "Devuelve `details` tal cual (JSON como string; nunca contenido clínico) y los hashes de la cadena.",
    ].join(" "),
    tags: [TAGS.audit],
    auth: { kind: "session", roles: ["admin"] },
    request: { query: auditLogsQuerySchema },
    responses: {
      200: { description: "Página de registros.", schema: okPaginated(AuditLogSchema) },
      ...errors({ 400: "Parámetros inválidos (ver `details`)." }, 401, 403),
    },
  },
  {
    method: "get",
    path: "/api/audit/recent",
    summary: "Actividad reciente (eventos con severidad, cursor)",
    description: [
      "Eventos de auditoría ya mapeados para mostrar (`userName`, `userRole`, `severity`), más nuevos primero, con paginación por cursor:",
      "repetir la llamada con `before = nextCursor` hasta que sea null. `action` y `resource` aceptan varios valores separados por coma.",
      "Un `limit` o `before` inválido se ignora en silencio (no hay 400).",
    ].join(" "),
    tags: [TAGS.audit],
    auth: { kind: "session", roles: ["admin"] },
    request: {
      query: z.object({
        action: z.string().optional().describe("Una o varias acciones separadas por coma (p. ej. `DELETE,VIEW_SENSITIVE`)."),
        resource: z.string().optional().describe("Uno o varios recursos separados por coma (p. ej. `patient,evolution`)."),
        userId: z.string().optional().describe("Solo eventos de este actor."),
        before: IsoDateTime.optional().describe("Cursor: solo eventos anteriores a esta fecha-hora (usar `nextCursor`)."),
        limit: z.coerce.number().int().min(1).max(100).optional().describe("Default 20, máximo 100."),
      }),
    },
    responses: {
      200: { description: "Eventos y cursor.", schema: ok(AuditRecentSchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "get",
    path: "/api/admin/integrity",
    summary: "Verificar las cadenas de hash (ledger clínico y audit log)",
    description: [
      "Recalcula la cadena de hashes de **todas** las entidades del ledger clínico (una cadena por asiento) y de hasta 1000 cadenas del audit log (una por `resource` + `resourceId`),",
      "y lista las rotas con el punto de ruptura. Operación costosa: recorre toda la base; pensada para el panel de integridad, no para polling.",
    ].join(" "),
    tags: [TAGS.audit],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: { description: "Informe de integridad.", schema: ok(IntegrityReportSchema) },
      ...errors(401, 403),
    },
  },
]);
