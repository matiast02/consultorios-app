# Contratos de la API

La documentación de la API se **genera del código**, no se escribe a mano.

| Archivo | Qué es |
|---|---|
| `openapi.json` | OpenAPI 3.1 completo, generado con `pnpm api:docs` desde `lib/openapi/paths/*.ts`. Versionado. |
| `openapi.mobile.json` | Solo las operaciones marcadas `mobile: true`: de acá se genera el cliente Dart de la app (ver `docs/API-MOBILE.md`). |

Reglas:

- Cada `app/api/**/route.ts` tiene su entrada en `lib/openapi/paths/<área>.ts`, con los
  **mismos schemas Zod** que valida la ruta (`lib/validations.ts`). El test
  `__tests__/openapi.test.ts` falla si falta una ruta, si sobra una entrada o si los JSON
  están desactualizados.
- Al agregar o cambiar una ruta: actualizar el registro, correr `pnpm api:docs` y commitear
  los JSON junto con el código.
- Los DTO llevan `.openapi({ ref: "Nombre" })` para que el cliente generado tenga clases con nombre.
- Visor: `/dashboard/administracion/api-docs` (admin). JSON en vivo: `GET /api/docs/openapi.json`.

Los antiguos `api-schemas/*.yaml` por feature fueron reemplazados por este registro.
