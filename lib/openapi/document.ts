// Ensambla el documento OpenAPI 3.1 a partir del registro (lib/openapi/paths/*).
//
// Se usa en tres lugares:
//   - scripts/generate-openapi.ts → contracts/openapi.json (versionado; de ahí
//     se genera el cliente Dart de la app).
//   - GET /api/docs/openapi.json (admin) → siempre el documento del código actual.
//   - __tests__/openapi.test.ts → cobertura y frescura.

import { z } from "zod";
import {
  createDocument,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
  type ZodOpenApiResponsesObject,
} from "zod-openapi";
import { API_VERSION, INFO_DESCRIPTION } from "./info";
import { TAGS, TAG_DESCRIPTIONS, operationIdOf, type ApiRoute, type Tag } from "./registry";

import { docsRoutes } from "./paths/docs";
import { authRoutes } from "./paths/auth";
import { patientsRoutes } from "./paths/patients";
import { shiftsRoutes } from "./paths/shifts";
import { agendaRoutes } from "./paths/agenda";
import { clinicalRecordRoutes } from "./paths/clinical-record";
import { attachmentsRoutes } from "./paths/attachments";
import { clinicalEntriesRoutes } from "./paths/clinical-entries";
import { grantsAndHcCopyRoutes } from "./paths/grants-hc-copy";
import { remindersRoutes } from "./paths/reminders";
import { onlineBookingRoutes } from "./paths/online-booking";
import { notificationsRoutes } from "./paths/notifications";
import { dashboardsRoutes } from "./paths/dashboards";
import { settingsRoutes } from "./paths/settings";
import { catalogsRoutes } from "./paths/catalogs";
import { adminRoutes } from "./paths/admin";
import { auditRoutes } from "./paths/audit";
import { publicRoutes } from "./paths/public";

/** Todas las rutas documentadas. El orden define el orden dentro de cada tag. */
export const ALL_ROUTES: ApiRoute[] = [
  ...docsRoutes,
  ...authRoutes,
  ...patientsRoutes,
  ...shiftsRoutes,
  ...agendaRoutes,
  ...clinicalRecordRoutes,
  ...attachmentsRoutes,
  ...clinicalEntriesRoutes,
  ...grantsAndHcCopyRoutes,
  ...remindersRoutes,
  ...onlineBookingRoutes,
  ...notificationsRoutes,
  ...dashboardsRoutes,
  ...settingsRoutes,
  ...catalogsRoutes,
  ...adminRoutes,
  ...auditRoutes,
  ...publicRoutes,
];

const BINARY = z.string().openapi({ format: "binary" });

function securityOf(route: ApiRoute) {
  switch (route.auth.kind) {
    case "session":
      return [{ cookieAuth: [] }, { bearerAuth: [] }];
    case "secret":
      return [{ cronSecret: [] }];
    case "public":
      return [];
  }
}

function responsesOf(route: ApiRoute): ZodOpenApiResponsesObject {
  const out: ZodOpenApiResponsesObject = {};
  for (const [status, res] of Object.entries(route.responses)) {
    const content = res.schema
      ? { "application/json": { schema: res.schema } }
      : res.contentType
        ? { [res.contentType]: { schema: BINARY } }
        : undefined;
    out[status as `${1 | 2 | 3 | 4 | 5}${string}`] = { description: res.description, ...(content ? { content } : {}) };
  }
  return out;
}

function operationOf(route: ApiRoute): ZodOpenApiOperationObject {
  const roles = route.auth.kind === "session" ? route.auth.roles : undefined;
  const authLine =
    route.auth.kind === "session"
      ? `**Acceso:** sesión${roles ? ` (${roles.join(", ")})` : " (cualquier rol)"}.`
      : route.auth.kind === "secret"
        ? `**Acceso:** header \`${route.auth.header}\` (secreto del servidor).`
        : "**Acceso:** público.";
  const description = [route.description?.trim(), authLine, route.mobile ? "**App móvil:** sí." : undefined]
    .filter(Boolean)
    .join("\n\n");

  const req = route.request;
  return {
    operationId: operationIdOf(route),
    summary: route.summary,
    description,
    tags: route.tags,
    ...(route.deprecated ? { deprecated: true } : {}),
    security: securityOf(route),
    ...(req?.params || req?.query
      ? { requestParams: { ...(req.params ? { path: req.params } : {}), ...(req.query ? { query: req.query } : {}) } }
      : {}),
    ...(req?.body
      ? {
          requestBody: {
            ...(req.bodyDescription ? { description: req.bodyDescription } : {}),
            required: true,
            content: { [req.bodyContentType ?? "application/json"]: { schema: req.body } },
          },
        }
      : {}),
    responses: responsesOf(route),
    "x-mobile": route.mobile ?? false,
    ...(roles ? { "x-roles": roles } : {}),
    "x-auth": route.auth.kind,
  } as ZodOpenApiOperationObject;
}

export interface BuildOptions {
  /** Solo las operaciones que usa la app (mobile: true) → contracts/openapi.mobile.json. */
  mobileOnly?: boolean;
}

/** Documento OpenAPI 3.1 (objeto plano, serializable). */
export function buildOpenApiDocument(options: BuildOptions = {}) {
  const routes = options.mobileOnly ? ALL_ROUTES.filter((r) => r.mobile) : ALL_ROUTES;
  const paths: ZodOpenApiPathsObject = {};
  for (const route of routes) {
    paths[route.path] = { ...(paths[route.path] ?? {}), [route.method]: operationOf(route) };
  }

  const usedTags = new Set<Tag>(routes.flatMap((r) => r.tags));
  const tags = (Object.values(TAGS) as Tag[])
    .filter((t) => usedTags.has(t))
    .map((name) => ({ name, description: TAG_DESCRIPTIONS[name] }));

  return createDocument({
    openapi: "3.1.0",
    info: {
      title: options.mobileOnly ? "Consultorio — API (app móvil)" : "Consultorio — API",
      version: API_VERSION,
      description: INFO_DESCRIPTION,
      contact: { name: "Equipo Consultorio" },
    },
    servers: [
      {
        url: "https://{host}",
        description: "Instancia del consultorio (una por cliente).",
        variables: { host: { default: "consultorio.example.com", description: "Dominio del consultorio" } },
      },
      { url: "http://localhost:3000", description: "Desarrollo" },
    ],
    tags,
    paths,
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Sesión web (Better Auth). La cookie se setea en el login y es HttpOnly.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Sesión para clientes nativos: el token viene en el header `set-auth-token` de la respuesta de login y se envía como `Authorization: Bearer <token>`.",
        },
        cronSecret: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "`Bearer <CRON_SECRET>`; solo para el cron del servidor.",
        },
      },
    },
  });
}

/** Resumen para logs y tests. */
export function summarize(routes: ApiRoute[] = ALL_ROUTES) {
  return {
    operations: routes.length,
    paths: new Set(routes.map((r) => r.path)).size,
    mobile: routes.filter((r) => r.mobile).length,
  };
}
