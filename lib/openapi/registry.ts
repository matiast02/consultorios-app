// Registro de la API: la ÚNICA fuente de verdad de la documentación.
//
// Cada ruta de `app/api/**/route.ts` tiene una entrada en `lib/openapi/paths/*.ts`
// que describe método, path, auth, roles, request (con los MISMOS schemas Zod
// que valida la ruta, en lib/validations.ts) y respuestas. De acá se genera
// `contracts/openapi.json` (pnpm api:docs), que ven el visor en
// /dashboard/administracion/api-docs y el generador del cliente Dart de la app.
//
// Reglas:
//   - Un test (__tests__/openapi.test.ts) falla si una ruta real no está en el
//     registro o si el registro apunta a una ruta que no existe.
//   - Los DTO de respuesta llevan `.openapi({ ref: "Nombre" })` para que el
//     documento use $ref y el cliente generado tenga clases con nombre.
//   - `mobile: true` marca lo que usa la app Flutter; `x-roles` documenta quién
//     puede llamar. La política real sigue viviendo en cada ruta.

import { z, type AnyZodObject, type ZodTypeAny } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";

extendZodWithOpenApi(z);

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
export type Role = "medic" | "secretary" | "admin";

export const TAGS = {
  auth: "Autenticación",
  patients: "Pacientes",
  shifts: "Turnos",
  agenda: "Agenda y disponibilidad",
  clinicalRecord: "Historia clínica",
  attachments: "Adjuntos de HC",
  prescriptions: "Recetas",
  studyOrders: "Órdenes de estudio",
  mealPlans: "Planes alimentarios",
  grants: "Concesiones de acceso a HC",
  hcCopy: "Copia de HC para el paciente",
  reminders: "Recordatorios",
  onlineBooking: "Reservas online",
  notifications: "Notificaciones",
  dashboard: "Dashboards",
  stats: "Estadísticas",
  settings: "Configuración del usuario",
  catalogs: "Catálogos",
  admin: "Administración",
  audit: "Auditoría e integridad",
  public: "Público (sin sesión)",
  internal: "Interno (cron)",
  docs: "Documentación",
} as const;

export type Tag = (typeof TAGS)[keyof typeof TAGS];

/** Orden y descripción de los tags en el documento. */
export const TAG_DESCRIPTIONS: Record<Tag, string> = {
  [TAGS.auth]: "Login, sesión y contraseñas (Better Auth). Cookie en web, `Authorization: Bearer` en la app.",
  [TAGS.patients]: "Alta, búsqueda, edición, archivo y restauración de pacientes.",
  [TAGS.shifts]: "Turnos: alta, edición, estados (pendiente, confirmado, ausente, finalizado, cancelado), llegada y consulta.",
  [TAGS.agenda]: "Horarios de atención, días bloqueados y disponibilidad.",
  [TAGS.clinicalRecord]: "Ficha clínica y evoluciones. Solo médicos (asientos propios) y admin; la secretaria nunca.",
  [TAGS.attachments]: "Archivos de la HC cifrados por archivo (PDF, JPEG, PNG, WebP) con miniaturas.",
  [TAGS.prescriptions]: "Recetas con ítems de medicación.",
  [TAGS.studyOrders]: "Órdenes de estudio y sus resultados.",
  [TAGS.mealPlans]: "Planes alimentarios (nutrición).",
  [TAGS.grants]: "Acceso cruzado entre médicos con consentimiento del paciente, acotado y revocable.",
  [TAGS.hcCopy]: "Solicitudes de copia de la historia clínica para el paciente (PDF con hashes del ledger).",
  [TAGS.reminders]: "Recordatorios de turnos por email / WhatsApp y confirmación del paciente.",
  [TAGS.onlineBooking]: "Reservas web que recepción confirma.",
  [TAGS.notifications]: "Notificaciones internas del usuario.",
  [TAGS.dashboard]: "Datos agregados de los dashboards por rol.",
  [TAGS.stats]: "Estadísticas de atención.",
  [TAGS.settings]: "Perfil, preferencias, notificaciones y obras sociales del profesional.",
  [TAGS.catalogs]: "Obras sociales, especialidades, tipos de consulta, profesiones, medicamentos.",
  [TAGS.admin]: "Usuarios, módulos, configuración del consultorio, solicitudes de contacto.",
  [TAGS.audit]: "Audit log con cadena de hashes y verificación de integridad de la HC.",
  [TAGS.public]: "Rutas sin sesión: landing, reserva online, links de gestión por token. Con rate limit.",
  [TAGS.internal]: "Rutas para el cron del servidor, protegidas por `CRON_SECRET`. No las usa ningún cliente.",
  [TAGS.docs]: "Este documento.",
};

export type RouteAuth =
  /** Sesión de Better Auth: cookie (web) o `Authorization: Bearer` (app). */
  | { kind: "session"; roles?: Role[] }
  /** Sin autenticación (rate limit, honeypot o token en la URL según el caso). */
  | { kind: "public" }
  /** Secreto compartido en un header (cron del servidor). */
  | { kind: "secret"; header: string };

export interface RouteResponse {
  description: string;
  /** Cuerpo JSON. */
  schema?: ZodTypeAny;
  /** Cuerpo binario o de otro tipo (p. ej. "application/pdf", "image/webp"). */
  contentType?: string;
}

export interface ApiRoute {
  method: HttpMethod;
  /** Path OpenAPI con parámetros entre llaves: "/api/patients/{id}". */
  path: string;
  summary: string;
  /** Markdown. Reglas de negocio, permisos finos, efectos (audit, ledger, emails). */
  description?: string;
  tags: [Tag, ...Tag[]];
  auth: RouteAuth;
  /** La app móvil (Flutter) usa esta ruta. */
  mobile?: boolean;
  deprecated?: boolean;
  /** Se deriva del método y el path si no se indica. Es el nombre del método en el cliente generado. */
  operationId?: string;
  request?: {
    params?: AnyZodObject;
    query?: AnyZodObject;
    body?: ZodTypeAny;
    bodyContentType?: "application/json" | "multipart/form-data";
    bodyDescription?: string;
  };
  responses: Record<number, RouteResponse>;
}

// ─── Envoltorios comunes ─────────────────────────────────────────────────────

/** Respuesta exitosa: `{ success: true, data }`. */
export function ok<T extends ZodTypeAny>(data: T, description?: string) {
  const schema = z.object({ success: z.literal(true), data });
  return description ? schema.describe(description) : schema;
}

/** `{ success: true, data: [...], pagination }` (listados paginados). */
export function okPaginated<T extends ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    pagination: PaginationSchema,
  });
}

/** `{ success: true }` sin datos (o con un mensaje). */
export const okEmpty = z.object({ success: z.literal(true), message: z.string().optional() });

export const PaginationSchema = z
  .object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .openapi({ ref: "Pagination" });

/** Error estándar: `{ success: false, error, code?, details? }`. */
export const ErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.string().describe("Mensaje para mostrar (español)."),
    code: z.string().optional().describe("Código estable para la app (p. ej. SLOT_TAKEN)."),
    details: z.unknown().optional().describe("Errores de validación por campo (Zod flatten)."),
  })
  .openapi({ ref: "Error" });

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Datos inválidos (ver `details`).",
  401: "Sin sesión o sesión vencida.",
  403: "La sesión no tiene permiso para esta operación.",
  404: "No existe o no es visible para el actor (respuesta idéntica en ambos casos).",
  405: "Método no permitido.",
  409: "Conflicto con el estado actual (ver `code`).",
  413: "Cuerpo demasiado grande.",
  422: "Contenido rechazado (tipo no permitido, antivirus).",
  429: "Demasiadas solicitudes (rate limit o bloqueo temporal).",
  500: "Error inesperado del servidor.",
  503: "Servicio requerido no disponible (p. ej. antivirus).",
};

/** Respuestas de error con descripción estándar (`errors(401, 404)`), o `errors({ 409: "…" })` para ajustar. */
export function errors(...codes: Array<number | Record<number, string>>): Record<number, RouteResponse> {
  const out: Record<number, RouteResponse> = {};
  for (const c of codes) {
    if (typeof c === "number") {
      out[c] = { description: ERROR_DESCRIPTIONS[c] ?? "Error", schema: ErrorSchema };
    } else {
      for (const [status, description] of Object.entries(c)) {
        out[Number(status)] = { description, schema: ErrorSchema };
      }
    }
  }
  return out;
}

/** Errores que toda ruta con sesión puede devolver. */
export const SESSION_ERRORS = errors(401, 403);

// ─── Parámetros comunes ──────────────────────────────────────────────────────

export const IdParam = z.object({ id: z.string().describe("ID (cuid)") });
export const PatientIdParam = z.object({ id: z.string().describe("ID del paciente") });

/** Fecha-hora ISO 8601 en UTC ("2026-09-24T14:30:00.000Z"). */
export const IsoDateTime = z.string().datetime({ offset: true }).openapi({ example: "2026-09-24T14:30:00.000Z" });
/** Fecha calendario "YYYY-MM-DD". */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).openapi({ example: "2026-09-24" });

// ─── Definición ──────────────────────────────────────────────────────────────

const PATH_RE = /^\/api(\/[a-zA-Z0-9._-]+|\/\{[a-zA-Z]+\})*$/;

/** Valida y devuelve las rutas (path bien formado, sin duplicados de método+path). */
export function defineRoutes(routes: ApiRoute[]): ApiRoute[] {
  const seen = new Set<string>();
  for (const r of routes) {
    if (!PATH_RE.test(r.path)) throw new Error(`Path OpenAPI inválido: ${r.method.toUpperCase()} ${r.path}`);
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) throw new Error(`Ruta duplicada en el registro: ${key}`);
    seen.add(key);
    if (Object.keys(r.responses).length === 0) throw new Error(`Sin respuestas: ${key}`);
  }
  return routes;
}

/** "getPatientsByIdAttachments" ← GET /api/patients/{id}/attachments (si no hay operationId explícito). */
export function operationIdOf(route: ApiRoute): string {
  if (route.operationId) return route.operationId;
  const parts = route.path
    .replace(/^\/api\//, "")
    .split("/")
    .map((seg) => {
      const m = seg.match(/^\{(.+)\}$/);
      const word = m ? `by-${m[1]}` : seg.replace(/\./g, "-");
      return word
        .split(/[-_]/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
    });
  return `${route.method}${parts.join("")}`;
}
