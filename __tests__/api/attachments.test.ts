// Adjuntos de la HC — rutas con cifrado REAL y storage en un directorio
// temporal: validación por magic bytes, límites, permisos (secretaria, otro
// médico, concesión), anulación, headers de descarga, ledger y compensación.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { encryptToStream } from "@/lib/attachments/file-crypto";
import { decryptField } from "@/lib/field-crypto";
import { getAttachmentStorage, objectKey } from "@/lib/attachments/storage";
import { uploadAttachment } from "@/lib/attachments/service";
import { fakeClamd, closedPort, TEST_MARKER, type FakeClamd } from "../helpers/fake-clamd";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GET as listRoute, POST as uploadRoute } from "@/app/api/patients/[id]/attachments/route";
import { GET as downloadRoute, DELETE as annulRoute } from "@/app/api/attachments/[id]/route";
import { GET as metaRoute } from "@/app/api/attachments/[id]/meta/route";
import { GET as ledgerRoute } from "@/app/api/clinical-ledger/route";

// ─── Entorno: clave de prueba y storage temporal ─────────────────────────────

const ENV_KEYS = ["HC_ENC_KEY", "ATTACHMENTS_DIR", "ATTACHMENTS_MAX_MB", "CLAMAV_HOST", "CLAMAV_PORT", "CLAMAV_TIMEOUT_MS"];
const savedEnv: Record<string, string | undefined> = {};
let storageDir = "";

beforeAll(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.HC_ENC_KEY = crypto.randomBytes(32).toString("base64");
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "hc-attachments-test-"));
  process.env.ATTACHMENTS_DIR = storageDir;
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  fs.rmSync(storageDir, { recursive: true, force: true });
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);
const EXE = Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00", "latin1"), Buffer.alloc(64, 0)]);
const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

const patientCtx = { params: Promise.resolve({ id: "p1" }) };
const idCtx = (id = "att1") => ({ params: Promise.resolve({ id }) });

function uploadReq(file: Buffer, name: string, fields: Record<string, string> = { entityType: "clinical_record" }) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(file)], name, { type: "application/pdf" }));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new NextRequest("http://x/api/patients/p1/attachments", { method: "POST", body: form });
}

const getReq = (url: string) => new NextRequest(url);
const delReq = (id: string, body: unknown) =>
  new NextRequest(`http://x/api/attachments/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function asRole(role: "medic" | "admin" | "secretary") {
  vi.mocked(getUserRole).mockResolvedValue(role);
}

function withGrant(sections: string[], entryIds: string[] = [], scope: "FULL" | "PARTIAL" = "PARTIAL") {
  prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue({
    id: "g1",
    patientId: "p1",
    status: "ACTIVE",
    scope,
    sections: JSON.stringify(sections),
    entryIds: JSON.stringify(entryIds),
    startsAt: new Date(Date.now() - DAY),
    expiresAt: new Date(Date.now() + DAY),
  });
}

/** Guarda `content` cifrado como lo haría la subida y devuelve la fila de la base. */
async function storedAttachment(content: Buffer, over: Record<string, unknown> = {}) {
  const id = (over.id as string) ?? "att1";
  const storageKey = objectKey("p1", id);
  const { PassThrough } = await import("node:stream");
  const sink = new PassThrough();
  const [info] = await Promise.all([
    encryptToStream(Readable.from([content]), sink),
    getAttachmentStorage().put(storageKey, sink),
  ]);
  return {
    id,
    patientId: "p1",
    uploadedById: "other-medic",
    entityType: "CLINICAL_RECORD",
    entityId: null,
    fileName: "Resultado análisis.pdf",
    mimeType: "application/pdf",
    sizeBytes: info.sizeBytes,
    sha256: info.sha256,
    description: null,
    annulledAt: null,
    annulReason: null,
    createdAt: new Date("2026-09-20T12:00:00Z"),
    uploadedBy: { id: "other-medic", name: "om", firstName: "Pedro", lastName: "Ruiz" },
    storageKey,
    wrappedDek: info.wrappedDek,
    ...over,
  };
}

const auditCalls = (action: string) => vi.mocked(logAudit).mock.calls.map((c) => c[0]).filter((a) => a.action === action);
const filesOnDisk = () =>
  fs.existsSync(path.join(storageDir, "p1")) ? fs.readdirSync(path.join(storageDir, "p1")) : [];

beforeEach(() => {
  resetAllMocks();
  vi.mocked(logAudit).mockClear();
  asRole("medic"); // sesión: user-1
  prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
  prismaMock.clinicalAttachment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    annulledAt: null,
    annulReason: null,
    createdAt: new Date("2026-09-24T12:00:00Z"),
    uploadedBy: { id: "user-1", name: "u1", firstName: "Laura", lastName: "Gómez" },
  }));
  delete process.env.ATTACHMENTS_MAX_MB;
  delete process.env.CLAMAV_HOST;
  delete process.env.CLAMAV_PORT;
});

afterEach(() => {
  // Cada test arranca con el storage vacío.
  fs.rmSync(path.join(storageDir, "p1"), { recursive: true, force: true });
});

// ─── Subida: validación ──────────────────────────────────────────────────────

describe("POST /api/patients/[id]/attachments — validación", () => {
  it("PDF válido → 201, cifrado en disco, ledger v1 y audit sin nombre de archivo", async () => {
    const res = await uploadRoute(uploadReq(PDF, "Resultado análisis.pdf", { entityType: "clinical_record", description: "Laboratorio" }), patientCtx);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      patientId: "p1",
      entityType: "CLINICAL_RECORD",
      entityId: null,
      fileName: "Resultado análisis.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
      sha256: sha256(PDF),
      description: "Laboratorio",
      uploadedBy: { id: "user-1", shortName: "L. Gómez" },
      canAnnul: true,
      annulledAt: null,
      inlinePreviewable: true,
    });
    expect(data).not.toHaveProperty("wrappedDek");
    expect(data).not.toHaveProperty("storageKey");

    // En disco: formato HCA1, sin el claro.
    const created = prismaMock.clinicalAttachment.create.mock.calls[0][0].data;
    const onDisk = fs.readFileSync(path.join(storageDir, created.storageKey));
    expect(onDisk.subarray(0, 4).toString()).toBe("HCA1");
    expect(onDisk.includes(Buffer.from("/Type /Catalog"))).toBe(false);
    expect(created.wrappedDek).toMatch(/^enc:/);
    expect(created.uploadedById).toBe("user-1");

    // Ledger: versión "created" del adjunto con el sha256 del claro.
    const ledger = prismaMock.clinicalEntryVersion.create.mock.calls[0][0].data;
    expect(ledger).toMatchObject({ entityType: "attachment", entityId: created.id, patientId: "p1", action: "created", version: 1 });
    expect(JSON.parse(ledger.data)).toEqual({
      fileName: "Resultado análisis.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
      sha256: sha256(PDF),
      entityType: "CLINICAL_RECORD",
      entityId: null,
      patientId: "p1",
    });

    const [audit] = auditCalls("CREATE");
    expect(audit).toMatchObject({ resource: "attachment", resourceId: created.id });
    expect(JSON.stringify(audit.details)).not.toContain("análisis");
  });

  it("EXE renombrado a .pdf → 422 por magic bytes; no escribe nada", async () => {
    const res = await uploadRoute(uploadReq(EXE, "estudio.pdf"), patientCtx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("UNSUPPORTED_TYPE");
    expect(prismaMock.clinicalAttachment.create).not.toHaveBeenCalled();
    expect(filesOnDisk()).toEqual([]);
  });

  it("contenido PDF con nombre .exe → se acepta con extensión corregida", async () => {
    const res = await uploadRoute(uploadReq(PDF, "informe.exe"), patientCtx);
    expect(res.status).toBe(201);
    expect((await res.json()).data.fileName).toBe("informe.pdf");
  });

  it("supera ATTACHMENTS_MAX_MB → 413 sin escribir", async () => {
    process.env.ATTACHMENTS_MAX_MB = "0.001"; // ~1 KB
    const big = Buffer.concat([PDF, Buffer.alloc(4096, 0x20)]);
    const res = await uploadRoute(uploadReq(big, "grande.pdf"), patientCtx);
    expect(res.status).toBe(413);
    expect(prismaMock.clinicalAttachment.create).not.toHaveBeenCalled();
    expect(filesOnDisk()).toEqual([]);
  });

  it("sin archivo / entityType inválido / archivo vacío → 400", async () => {
    const form = new FormData();
    form.set("entityType", "clinical_record");
    const noFile = await uploadRoute(
      new NextRequest("http://x/api/patients/p1/attachments", { method: "POST", body: form }),
      patientCtx,
    );
    expect(noFile.status).toBe(400);
    expect((await uploadRoute(uploadReq(PDF, "a.pdf", { entityType: "receta" }), patientCtx)).status).toBe(400);
    expect((await uploadRoute(uploadReq(Buffer.alloc(0), "a.pdf"), patientCtx)).status).toBe(400);
  });

  it("entityType en minúsculas (contrato) + evolución propia → 201 con MAYÚSCULAS", async () => {
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", userId: "user-1", annulledAt: null });
    const res = await uploadRoute(uploadReq(PNG, "rx.png", { entityType: "evolution", entityId: "e1" }), patientCtx);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ entityType: "EVOLUTION", entityId: "e1", mimeType: "image/png" });
    // El asiento se busca dentro del paciente.
    expect(prismaMock.evolution.findFirst.mock.calls[0][0].where).toEqual({ id: "e1", clinicalRecord: { patientId: "p1" } });
  });

  it("asiento de otro autor → 403; inexistente → 404; anulado → 409", async () => {
    prismaMock.studyOrder.findFirst.mockResolvedValue({ id: "o1", userId: "other-medic", annulledAt: null });
    expect((await uploadRoute(uploadReq(PDF, "a.pdf", { entityType: "STUDY_ORDER", entityId: "o1" }), patientCtx)).status).toBe(403);
    prismaMock.studyOrder.findFirst.mockResolvedValue(null);
    expect((await uploadRoute(uploadReq(PDF, "a.pdf", { entityType: "study_order", entityId: "o1" }), patientCtx)).status).toBe(404);
    prismaMock.studyOrder.findFirst.mockResolvedValue({ id: "o1", userId: "user-1", annulledAt: new Date() });
    expect((await uploadRoute(uploadReq(PDF, "a.pdf", { entityType: "study_order", entityId: "o1" }), patientCtx)).status).toBe(409);
    expect(filesOnDisk()).toEqual([]);
  });

  it("paciente inexistente o archivado → 404", async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);
    expect((await uploadRoute(uploadReq(PDF, "a.pdf"), patientCtx)).status).toBe(404);
  });

  it("falla la base después de escribir el archivo → se borra (compensación)", async () => {
    prismaMock.clinicalAttachment.create.mockRejectedValue(new Error("db caída"));
    const remove = vi.spyOn(getAttachmentStorage(), "remove");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await uploadRoute(uploadReq(PDF, "a.pdf"), patientCtx);
    err.mockRestore();
    expect(res.status).toBe(500);
    // Se llegó a escribir (existe el directorio del paciente) y se compensó.
    expect(fs.existsSync(path.join(storageDir, "p1"))).toBe(true);
    expect(remove).toHaveBeenCalledWith(prismaMock.clinicalAttachment.create.mock.calls[0][0].data.storageKey);
    expect(filesOnDisk()).toEqual([]);
    expect(auditCalls("CREATE")).toHaveLength(0);
    remove.mockRestore();
  });

  it("si `size` miente, el stream se corta al superar el máximo (413) y no queda nada en disco", async () => {
    process.env.ATTACHMENTS_MAX_MB = "0.001"; // ~1 KB
    const big = Buffer.concat([PDF, Buffer.alloc(8192, 0x20)]);
    const lying = {
      name: "a.pdf",
      size: 100, // declara menos de lo que trae
      slice: (start?: number, end?: number) => new Blob([new Uint8Array(big.subarray(start, end))]),
      stream: () => new Blob([new Uint8Array(big)]).stream(),
    };
    await expect(
      uploadAttachment({
        actor: { userId: "user-1", role: "medic", isAdmin: false, isMedic: true },
        patientId: "p1",
        entityType: "CLINICAL_RECORD",
        file: lying,
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(filesOnDisk()).toEqual([]); // ni el archivo ni el .tmp
    expect(prismaMock.clinicalAttachment.create).not.toHaveBeenCalled();
  });
});

describe("POST — antivirus (CLAMAV_HOST)", () => {
  let clamd: FakeClamd | null = null;
  afterEach(async () => {
    await clamd?.close();
    clamd = null;
  });

  it("FOUND → 422 sin escribir; OK → 201", async () => {
    clamd = await fakeClamd();
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(clamd.port);

    const infected = Buffer.concat([PDF, Buffer.from(TEST_MARKER)]);
    const res = await uploadRoute(uploadReq(infected, "a.pdf"), patientCtx);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("AV_FOUND");
    expect(filesOnDisk()).toEqual([]);

    expect((await uploadRoute(uploadReq(PDF, "a.pdf"), patientCtx)).status).toBe(201);
  });

  it("configurado pero caído → 503 (fail closed)", async () => {
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(await closedPort());
    process.env.CLAMAV_TIMEOUT_MS = "2000";
    const res = await uploadRoute(uploadReq(PDF, "a.pdf"), patientCtx);
    expect(res.status).toBe(503);
    expect(prismaMock.clinicalAttachment.create).not.toHaveBeenCalled();
  });
});

// ─── Permisos ────────────────────────────────────────────────────────────────

describe("permisos", () => {
  it("secretaria → 403 en listar, subir, descargar y metadatos", async () => {
    asRole("secretary");
    expect((await listRoute(getReq("http://x/api/patients/p1/attachments"), patientCtx)).status).toBe(403);
    expect((await uploadRoute(uploadReq(PDF, "a.pdf"), patientCtx)).status).toBe(403);
    expect((await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx())).status).toBe(403);
    expect((await metaRoute(getReq("http://x/api/attachments/att1/meta"), idCtx())).status).toBe(403);
    expect(prismaMock.clinicalAttachment.findMany).not.toHaveBeenCalled();
    expect(prismaMock.clinicalAttachment.findUnique).not.toHaveBeenCalled();
  });

  it("admin no sube (custodia, no escribe)", async () => {
    asRole("admin");
    expect((await uploadRoute(uploadReq(PDF, "a.pdf"), patientCtx)).status).toBe(403);
  });

  it("listado de médico sin concesión: solo propios; anulados ajenos nunca", async () => {
    await listRoute(getReq("http://x/api/patients/p1/attachments?entityType=evolution&entityId=e1"), patientCtx);
    const where = prismaMock.clinicalAttachment.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      patientId: "p1",
      uploadedById: "user-1",
      entityType: "EVOLUTION",
      entityId: "e1",
      AND: [{ OR: [{ annulledAt: null }, { uploadedById: "user-1" }] }],
    });
    expect(prismaMock.clinicalAttachment.findMany.mock.calls[0][0].select.wrappedDek).toBeUndefined();
  });

  it("listado con concesión 'estudios' → todos los del paciente + audit con grantId", async () => {
    withGrant(["estudios"]);
    const row = await storedAttachment(PDF);
    prismaMock.clinicalAttachment.findMany.mockResolvedValue([row]);
    const res = await listRoute(getReq("http://x/api/patients/p1/attachments"), patientCtx);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: "att1", canAnnul: false, uploadedBy: { shortName: "P. Ruiz" } });
    expect(prismaMock.clinicalAttachment.findMany.mock.calls[0][0].where.uploadedById).toBeUndefined();
    expect(auditCalls("VIEW_SENSITIVE")[0]).toMatchObject({
      resource: "attachment",
      resourceId: "p1",
      details: { list: true, count: 1, grantId: "g1" },
    });
  });

  it("otro médico sin concesión → 404 en descarga, metadatos y anulación", async () => {
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(await storedAttachment(PDF));
    expect((await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx())).status).toBe(404);
    expect((await metaRoute(getReq("http://x/api/attachments/att1/meta"), idCtx())).status).toBe(404);
    expect((await annulRoute(delReq("att1", { reason: "error de carga" }), idCtx())).status).toBe(404);
    expect(auditCalls("VIEW_SENSITIVE")).toHaveLength(0);
  });

  it("con concesión 'estudios' → 200: contenido íntegro + VIEW_SENSITIVE { attachmentId, grantId }", async () => {
    withGrant(["estudios"]);
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(await storedAttachment(PDF));
    const res = await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx());
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    expect(auditCalls("VIEW_SENSITIVE")[0]).toMatchObject({
      resource: "attachment",
      resourceId: "att1",
      details: { attachmentId: "att1", grantId: "g1" },
    });
  });

  it("concesión que no cubre (solo recetas) → 404", async () => {
    withGrant(["recetas"]);
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(await storedAttachment(PDF));
    expect((await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx())).status).toBe(404);
  });

  it("anulado: el beneficiario de la concesión ya no lo ve; el autor sí (marcado)", async () => {
    withGrant(["estudios"]);
    const annulled = await storedAttachment(PDF, { annulledAt: new Date(), annulReason: "paciente equivocado" });
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(annulled);
    expect((await metaRoute(getReq("http://x/api/attachments/att1/meta"), idCtx())).status).toBe(404);

    prismaMock.clinicalAttachment.findUnique.mockResolvedValue({ ...annulled, uploadedById: "user-1" });
    const res = await metaRoute(getReq("http://x/api/attachments/att1/meta"), idCtx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ annulReason: "paciente equivocado", canAnnul: false });
  });
});

// ─── Anulación ───────────────────────────────────────────────────────────────

describe("DELETE /api/attachments/[id] — anulación", () => {
  it("solo el autor: con concesión se lee pero no se anula (403)", async () => {
    withGrant(["estudios"]);
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(await storedAttachment(PDF));
    const res = await annulRoute(delReq("att1", { reason: "no corresponde" }), idCtx());
    expect(res.status).toBe(403);
    expect(prismaMock.clinicalAttachment.updateMany).not.toHaveBeenCalled();
  });

  it("admin tampoco anula (403)", async () => {
    asRole("admin");
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(await storedAttachment(PDF));
    expect((await annulRoute(delReq("att1", { reason: "no corresponde" }), idCtx())).status).toBe(403);
  });

  it("autor → 200: anulación lógica condicional + ledger 'annulled' + audit DELETE; el archivo queda", async () => {
    const row = await storedAttachment(PDF, { uploadedById: "user-1" });
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(row);
    prismaMock.clinicalAttachment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.clinicalEntryVersion.findFirst.mockResolvedValue({ version: 1, contentHash: "h1" });

    const res = await annulRoute(delReq("att1", { reason: "Paciente equivocado" }), idCtx());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ id: "att1", annulReason: "Paciente equivocado", canAnnul: false });
    expect(data.annulledAt).toBeTruthy();

    const upd = prismaMock.clinicalAttachment.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "att1", annulledAt: null });
    expect(upd.data).toMatchObject({ annulledById: "user-1", annulReason: "Paciente equivocado" });
    const ledger = prismaMock.clinicalEntryVersion.create.mock.calls[0][0].data;
    expect(ledger).toMatchObject({ entityType: "attachment", entityId: "att1", action: "annulled", version: 2, prevHash: "h1", reason: "Paciente equivocado" });
    expect(auditCalls("DELETE")[0]).toMatchObject({ resource: "attachment", details: { patientId: "p1", annulled: true } });
    expect(fs.existsSync(path.join(storageDir, row.storageKey))).toBe(true);
  });

  it("sin motivo → 400; ya anulado → 409", async () => {
    const row = await storedAttachment(PDF, { uploadedById: "user-1" });
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(row);
    expect((await annulRoute(delReq("att1", {}), idCtx())).status).toBe(400);
    expect((await annulRoute(delReq("att1", { reason: "x" }), idCtx())).status).toBe(400);

    // Carrera: otro request lo anuló entre la lectura y el update.
    prismaMock.clinicalAttachment.updateMany.mockResolvedValue({ count: 0 });
    expect((await annulRoute(delReq("att1", { reason: "duplicado" }), idCtx())).status).toBe(409);
    expect(prismaMock.clinicalEntryVersion.create).not.toHaveBeenCalled();

    prismaMock.clinicalAttachment.findUnique.mockResolvedValue({ ...row, annulledAt: new Date() });
    expect((await annulRoute(delReq("att1", { reason: "duplicado" }), idCtx())).status).toBe(409);
  });
});

// ─── Descarga: headers ───────────────────────────────────────────────────────

describe("GET /api/attachments/[id] — headers", () => {
  beforeEach(() => asRole("admin"));

  it("por defecto: attachment, tipo real, nosniff, no-store, sandbox", async () => {
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(await storedAttachment(PDF));
    const res = await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="Resultado analisis.pdf"; filename*=UTF-8''Resultado%20an%C3%A1lisis.pdf`,
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(res.headers.get("Content-Length")).toBe(String(PDF.length));
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    expect(auditCalls("VIEW_SENSITIVE")[0].details).toEqual({ attachmentId: "att1" });
  });

  it("?inline=1 imagen → inline con CSP sandbox", async () => {
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(
      await storedAttachment(PNG, { mimeType: "image/png", fileName: "rx.png" }),
    );
    const res = await downloadRoute(getReq("http://x/api/attachments/att1?inline=1"), idCtx());
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; /);
    expect(res.headers.get("Content-Security-Policy")).toMatch(/^sandbox; default-src 'none'/);
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("?inline=1 PDF → inline SIN sandbox (Chrome), default-src 'none', frame-ancestors 'self'", async () => {
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(await storedAttachment(PDF));
    const res = await downloadRoute(getReq("http://x/api/attachments/att1?inline=1"), idCtx());
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; /);
    expect(csp).not.toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("con la extensión de Prisma (wrappedDek ya descifrado al leer) también descifra", async () => {
    const row = await storedAttachment(PDF);
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue({ ...row, wrappedDek: decryptField(row.wrappedDek) });
    const res = await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx());
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
  });

  it("archivo alterado en disco → el stream termina con error (tag GCM)", async () => {
    const row = await storedAttachment(PDF);
    const file = path.join(storageDir, row.storageKey);
    const bytes = fs.readFileSync(file);
    bytes[20] ^= 0xff; // un byte del ciphertext
    fs.writeFileSync(file, bytes);
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(row);
    const res = await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx());
    expect(res.status).toBe(200); // los headers salen antes de verificar el tag
    await expect(res.arrayBuffer()).rejects.toThrow();
  });

  it("archivo faltante en storage → 500 sin auditar lectura", async () => {
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue({
      ...(await storedAttachment(PDF)),
      storageKey: objectKey("p1", "no-existe"),
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await downloadRoute(getReq("http://x/api/attachments/att1"), idCtx());
    err.mockRestore();
    expect(res.status).toBe(500);
    expect(auditCalls("VIEW_SENSITIVE")).toHaveLength(0);
  });
});

// ─── Ledger ──────────────────────────────────────────────────────────────────

describe("GET /api/clinical-ledger?entityType=attachment", () => {
  const url = "http://x/api/clinical-ledger?entityType=attachment&entityId=att1";
  const ATT = {
    id: "att1",
    uploadedById: "other-medic",
    entityType: "STUDY_ORDER",
    entityId: "o1",
    patientId: "p1",
    annulledAt: null,
  };

  it("sin acceso → 404; con concesión sobre la orden asociada → 200", async () => {
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue(ATT);
    expect((await ledgerRoute(getReq(url))).status).toBe(404);

    withGrant([], ["o1"]);
    const res = await ledgerRoute(getReq(url));
    expect(res.status).toBe(200);
    expect(auditCalls("VIEW_SENSITIVE")[0].details).toMatchObject({ entityType: "attachment", grantId: "g1" });
  });

  it("anulado ajeno → 404 aunque la concesión lo cubra", async () => {
    withGrant(["estudios"]);
    prismaMock.clinicalAttachment.findUnique.mockResolvedValue({ ...ATT, annulledAt: new Date() });
    expect((await ledgerRoute(getReq(url))).status).toBe(404);
  });
});
