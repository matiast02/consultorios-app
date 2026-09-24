// Auditoría: /api/audit-logs, /api/audit/recent, /api/admin/integrity.
// Pendiente de documentar: el test __tests__/openapi.test.ts lista las rutas que faltan.
// Convenciones en lib/openapi/registry.ts y ejemplos en paths/attachments.ts.

import { defineRoutes } from "../registry";

export const auditRoutes = defineRoutes([]);
