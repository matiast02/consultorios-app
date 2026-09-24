// Documentación de la API: el registro (lib/openapi) debe cubrir TODAS las
// rutas reales y contracts/openapi.json debe estar regenerado (pnpm api:docs).
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ALL_ROUTES, buildOpenApiDocument } from "@/lib/openapi/document";
import { operationIdOf, type HttpMethod } from "@/lib/openapi/registry";

const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(ROOT, "app", "api");

/** Rutas catch-all: cualquier entrada del registro bajo el prefijo la cubre. */
const CATCH_ALL: Record<string, string> = {
  "/api/auth/{all}": "/api/auth/",
};

interface RealRoute {
  file: string;
  path: string;
  methods: HttpMethod[];
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name === "route.ts" ? [full] : [];
  });
}

/** app/api/patients/[id]/route.ts → /api/patients/{id}; [...all] → {all}. */
function toOpenApiPath(file: string): string {
  const rel = path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/");
  const segments = rel
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}"));
  return `/api${segments.length ? `/${segments.join("/")}` : ""}`;
}

function realRoutes(): RealRoute[] {
  return walk(API_DIR).map((file) => {
    const src = fs.readFileSync(file, "utf8");
    const methods = new Set<HttpMethod>();
    for (const m of src.matchAll(/^export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/gm)) {
      methods.add(m[1].toLowerCase() as HttpMethod);
    }
    for (const m of src.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE)\b/gm)) {
      methods.add(m[1].toLowerCase() as HttpMethod);
    }
    // `export { handler as GET }` y `export const { GET, POST } = toNextJsHandler(auth)`
    for (const block of src.matchAll(/^export (?:const )?\{([^}]*)\}/gm)) {
      for (const m of block[1].matchAll(/(?:\bas |^|,)\s*(GET|POST|PUT|PATCH|DELETE)\b/g)) {
        methods.add(m[1].toLowerCase() as HttpMethod);
      }
    }
    return { file: path.relative(ROOT, file).split(path.sep).join("/"), path: toOpenApiPath(file), methods: [...methods] };
  });
}

const registryKeys = new Set(ALL_ROUTES.map((r) => `${r.method.toUpperCase()} ${r.path}`));

describe("registro OpenAPI: cobertura de rutas", () => {
  const real = realRoutes();

  it("encuentra las rutas reales", () => {
    expect(real.length).toBeGreaterThan(50);
    expect(real.every((r) => r.methods.length > 0)).toBe(true);
  });

  it("toda ruta real (método + path) está en el registro", () => {
    const missing: string[] = [];
    for (const r of real) {
      const prefix = CATCH_ALL[r.path];
      for (const method of r.methods) {
        const covered = prefix
          ? ALL_ROUTES.some((x) => x.method === method && x.path.startsWith(prefix))
          : registryKeys.has(`${method.toUpperCase()} ${r.path}`);
        if (!covered) missing.push(`${method.toUpperCase()} ${r.path}  (${r.file})`);
      }
    }
    expect(missing, `Rutas sin documentar en lib/openapi/paths:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("toda entrada del registro corresponde a una ruta real", () => {
    const realKeys = new Set(real.flatMap((r) => r.methods.map((m) => `${m.toUpperCase()} ${r.path}`)));
    const catchAllPrefixes = Object.entries(CATCH_ALL)
      .filter(([p]) => real.some((r) => r.path === p))
      .map(([, prefix]) => prefix);
    const orphan = ALL_ROUTES.filter(
      (x) =>
        !realKeys.has(`${x.method.toUpperCase()} ${x.path}`) && !catchAllPrefixes.some((p) => x.path.startsWith(p)),
    ).map((x) => `${x.method.toUpperCase()} ${x.path}`);
    expect(orphan, `Entradas del registro sin ruta real:\n  ${orphan.join("\n  ")}`).toEqual([]);
  });

  it("operationId únicos (nombres de método del cliente generado)", () => {
    const ids = ALL_ROUTES.map(operationIdOf);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });
});

describe("documento OpenAPI", () => {
  const doc = buildOpenApiDocument();

  it("se construye y es 3.1 con todas las operaciones", () => {
    expect(doc.openapi).toBe("3.1.0");
    const ops = Object.values(doc.paths ?? {}).flatMap((p) => Object.keys(p ?? {})).length;
    expect(ops).toBe(ALL_ROUTES.length);
  });

  it("toda operación tiene tag, summary, security y al menos una respuesta 2xx", () => {
    const problems: string[] = [];
    for (const [p, item] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(item ?? {})) {
        const o = op as { summary?: string; tags?: string[]; responses?: Record<string, unknown>; security?: unknown[] };
        if (!o.summary) problems.push(`${method} ${p}: sin summary`);
        if (!o.tags?.length) problems.push(`${method} ${p}: sin tag`);
        if (!Array.isArray(o.security)) problems.push(`${method} ${p}: sin security`);
        if (!Object.keys(o.responses ?? {}).some((s) => s.startsWith("2"))) problems.push(`${method} ${p}: sin 2xx`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("contracts/openapi.json y openapi.mobile.json están actualizados (si falla: pnpm api:docs)", () => {
    const check = (name: string, generated: unknown) => {
      const file = path.join(ROOT, "contracts", name);
      expect(fs.existsSync(file), `falta contracts/${name}: correr pnpm api:docs`).toBe(true);
      const committed = JSON.parse(fs.readFileSync(file, "utf8"));
      expect(committed, `contracts/${name} desactualizado: correr pnpm api:docs`).toEqual(
        JSON.parse(JSON.stringify(generated)),
      );
    };
    check("openapi.json", doc);
    check("openapi.mobile.json", buildOpenApiDocument({ mobileOnly: true }));
  });

  it("el documento móvil solo tiene operaciones marcadas para la app", () => {
    const mobile = buildOpenApiDocument({ mobileOnly: true });
    const ops = Object.values(mobile.paths ?? {}).flatMap((p) => Object.values(p ?? {}));
    expect(ops.length).toBe(ALL_ROUTES.filter((r) => r.mobile).length);
    expect(ops.every((op) => (op as { "x-mobile"?: boolean })["x-mobile"] === true)).toBe(true);
  });
});
