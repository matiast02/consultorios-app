// Documentación: /api/docs/**.

import { z } from "zod";
import { defineRoutes, errors, TAGS } from "../registry";

export const docsRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/docs/openapi.json",
    summary: "Documento OpenAPI del código actual",
    description:
      "Generado en el momento desde el registro (`lib/openapi`). Para el cliente de la app se usa el archivo versionado `contracts/openapi.json` (o `openapi.mobile.json`).",
    tags: [TAGS.docs],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: {
        description: "Documento OpenAPI 3.1.",
        schema: z.object({ openapi: z.string(), info: z.object({ title: z.string(), version: z.string() }) }).passthrough(),
      },
      ...errors(401, 403),
    },
  },
]);
