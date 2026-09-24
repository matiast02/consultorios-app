// Genera contracts/openapi.json (completo) y contracts/openapi.mobile.json
// (solo operaciones marcadas `mobile: true`) desde el registro (lib/openapi).
//
// Uso: pnpm api:docs
// El test __tests__/openapi.test.ts falla si los archivos quedaron desactualizados.

import fs from "node:fs";
import path from "node:path";
import { ALL_ROUTES, buildOpenApiDocument, summarize } from "../lib/openapi/document";

const DIR = path.join(process.cwd(), "contracts");
fs.mkdirSync(DIR, { recursive: true });

function write(file: string, doc: unknown) {
  fs.writeFileSync(path.join(DIR, file), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

const full = buildOpenApiDocument();
write("openapi.json", full);
const mobile = buildOpenApiDocument({ mobileOnly: true });
write("openapi.mobile.json", mobile);

const s = summarize();
console.log(
  `contracts/openapi.json: ${s.paths} paths, ${s.operations} operaciones, ` +
    `${Object.keys(full.components?.schemas ?? {}).length} schemas con nombre.`,
);
console.log(
  `contracts/openapi.mobile.json: ${summarize(ALL_ROUTES.filter((r) => r.mobile)).operations} operaciones para la app.`,
);
