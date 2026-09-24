// Adjuntos de la HC — piezas puras: política de lectura (kind "attachment"),
// nombres de archivo, headers de descarga y cliente de clamd.
import { Readable } from "node:stream";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import {
  attachmentEntryRef,
  attachmentScopeFromGrant,
  canReadEntry,
  grantCoversKind,
  readScopeForList,
  type ActiveGrant,
  type ClinicalActor,
} from "@/lib/clinical-access";
import { ENTRY_KIND_SECTION } from "@/lib/clinical-grants-shared";
import { normalizeFileName, uploaderShortName } from "@/lib/attachments/service";
import { ATTACHMENT_CSP, contentDisposition, downloadHeaders, safeContentType } from "@/lib/attachments/http";
import { parseClamdResponse, scanWithClamav, ClamavUnavailableError } from "@/lib/attachments/clamav";
import { closedPort, fakeClamd, markerVerdict, TEST_MARKER, type FakeClamd } from "./helpers/fake-clamd";

const DAY = 24 * 60 * 60 * 1000;
const medic: ClinicalActor = { userId: "m1", role: "medic", isAdmin: false, isMedic: true };
const admin: ClinicalActor = { userId: "a1", role: "admin", isAdmin: true, isMedic: false };

const grant = (over: Partial<ActiveGrant> = {}): ActiveGrant => ({
  id: "g1",
  patientId: "p1",
  scope: "PARTIAL",
  sections: [],
  entryIds: [],
  startsAt: new Date(Date.now() - DAY),
  expiresAt: new Date(Date.now() + DAY),
  ...over,
});

const grantRow = (sections: string[], entryIds: string[] = [], scope = "PARTIAL") => ({
  id: "g1",
  patientId: "p1",
  status: "ACTIVE",
  scope,
  sections: JSON.stringify(sections),
  entryIds: JSON.stringify(entryIds),
  startsAt: new Date(Date.now() - DAY),
  expiresAt: new Date(Date.now() + DAY),
});

const foreign = (over: Record<string, unknown> = {}) =>
  attachmentEntryRef({
    id: "att1",
    uploadedById: "other",
    entityType: "CLINICAL_RECORD",
    entityId: null,
    ...over,
  } as { id: string; uploadedById: string; entityType: string; entityId: string | null });

beforeEach(() => resetAllMocks());

describe("política de lectura de adjuntos", () => {
  it("el kind attachment se cubre con la sección estudios", () => {
    expect(ENTRY_KIND_SECTION.attachment).toBe("estudios");
    expect(grantCoversKind(grant({ sections: ["estudios"] }), "attachment")).toBe(true);
    expect(grantCoversKind(grant({ sections: ["recetas"] }), "attachment")).toBe(false);
    expect(grantCoversKind(grant({ scope: "FULL" }), "attachment")).toBe(true);
  });

  it("autor y admin leen sin concesión; ajeno sin concesión no", async () => {
    expect(await canReadEntry(medic, foreign({ uploadedById: "m1" }), "p1", "attachment")).toEqual({ ok: true });
    expect(await canReadEntry(admin, foreign(), "p1", "attachment")).toEqual({ ok: true });
    expect(await canReadEntry(medic, foreign(), "p1", "attachment")).toEqual({ ok: false });
  });

  it("concesión: estudios cubre todo; evoluciones solo los asociados a evoluciones", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(grantRow(["estudios"]));
    expect(await canReadEntry(medic, foreign(), "p1", "attachment")).toEqual({ ok: true, grantId: "g1" });

    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(grantRow(["evoluciones"]));
    const onEvolution = foreign({ entityType: "EVOLUTION", entityId: "e1" });
    expect(await canReadEntry(medic, onEvolution, "p1", "attachment")).toEqual({ ok: true, grantId: "g1" });
    expect(await canReadEntry(medic, foreign(), "p1", "attachment")).toEqual({ ok: false });
  });

  it("concesión por entryIds: el id del adjunto o el del asiento asociado", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(grantRow(["recetas"], ["att1", "o9"]));
    expect((await canReadEntry(medic, foreign(), "p1", "attachment")).ok).toBe(true);
    const onOrder = foreign({ id: "att2", entityType: "STUDY_ORDER", entityId: "o9" });
    expect((await canReadEntry(medic, onOrder, "p1", "attachment")).ok).toBe(true);
    const other = foreign({ id: "att3", entityType: "STUDY_ORDER", entityId: "o1" });
    expect((await canReadEntry(medic, other, "p1", "attachment")).ok).toBe(false);
  });

  it("listado: tabla de alcances (propios / todo / OR)", () => {
    expect(attachmentScopeFromGrant(admin, null)).toEqual({ where: {} });
    expect(attachmentScopeFromGrant(medic, null)).toEqual({ where: { uploadedById: "m1" } });
    expect(attachmentScopeFromGrant(medic, grant({ scope: "FULL" }))).toEqual({ where: {}, grantId: "g1" });
    expect(attachmentScopeFromGrant(medic, grant({ sections: ["estudios"] }))).toEqual({ where: {}, grantId: "g1" });
    expect(attachmentScopeFromGrant(medic, grant({ sections: ["recetas"] }))).toEqual({ where: { uploadedById: "m1" } });

    const evo = attachmentScopeFromGrant(medic, grant({ sections: ["evoluciones"] }));
    expect(evo).toEqual({
      where: { OR: [{ uploadedById: "m1" }, { entityType: "EVOLUTION", entityId: { not: null } }] },
      grantId: "g1",
    });

    const ids = attachmentScopeFromGrant(medic, grant({ entryIds: ["att1", "e1"] }));
    expect(ids.where.OR).toEqual([
      { uploadedById: "m1" },
      { id: { in: ["att1", "e1"] } },
      { entityType: { in: ["EVOLUTION", "STUDY_ORDER"] }, entityId: { in: ["att1", "e1"] } },
    ]);
  });

  it("readScopeForList('attachment') usa la concesión vigente y filtra por uploadedById", async () => {
    expect(await readScopeForList(medic, "p1", "attachment")).toEqual({ where: { uploadedById: "m1" } });
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(grantRow(["estudios"]));
    expect(await readScopeForList(medic, "p1", "attachment")).toEqual({ where: {}, grantId: "g1" });
  });
});

describe("normalizeFileName", () => {
  it("alinea la extensión con el tipo REAL detectado", () => {
    expect(normalizeFileName("estudio.pdf", "application/pdf")).toBe("estudio.pdf");
    expect(normalizeFileName("estudio.PDF", "application/pdf")).toBe("estudio.PDF");
    expect(normalizeFileName("malware.exe", "application/pdf")).toBe("malware.pdf");
    expect(normalizeFileName("foto", "image/jpeg")).toBe("foto.jpg");
    expect(normalizeFileName("foto.jpeg", "image/jpeg")).toBe("foto.jpeg");
    expect(normalizeFileName("rx.png.exe", "image/png")).toBe("rx.png.png");
  });

  it("sanea rutas, caracteres de control y bidi; vacío → adjunto.ext", () => {
    expect(normalizeFileName("C:\\fakepath\\..\\informe.pdf", "application/pdf")).toBe("informe.pdf");
    expect(normalizeFileName("../../etc/passwd", "application/pdf")).toBe("passwd.pdf");
    expect(normalizeFileName("inf\u202Efdp.exe", "application/pdf")).toBe("inffdp.pdf");
    expect(normalizeFileName("a\u0000b\"c.pdf", "application/pdf")).toBe("abc.pdf");
    expect(normalizeFileName("", "image/webp")).toBe("adjunto.webp");
    expect(normalizeFileName(".pdf", "application/pdf")).toBe("adjunto.pdf");
  });

  it("uploaderShortName: inicial + apellido, o lo que haya", () => {
    expect(uploaderShortName({ firstName: "laura", lastName: "Gómez" })).toBe("L. Gómez");
    expect(uploaderShortName({ firstName: "Laura", lastName: null })).toBe("Laura");
    expect(uploaderShortName({ name: "lgomez" })).toBe("lgomez");
    expect(uploaderShortName(null)).toBe("Profesional");
  });
});

describe("headers de descarga", () => {
  const pdf = { mimeType: "application/pdf", fileName: "Resultado análisis (1).pdf", sizeBytes: 1234 };
  const png = { mimeType: "image/png", fileName: "rx.png", sizeBytes: 10 };

  it("por defecto attachment + sandbox + no embebible", () => {
    const h = downloadHeaders(pdf, false);
    expect(h.get("Content-Type")).toBe("application/pdf");
    expect(h.get("Content-Disposition")).toBe(
      `attachment; filename="Resultado analisis (1).pdf"; filename*=UTF-8''Resultado%20an%C3%A1lisis%20%281%29.pdf`,
    );
    expect(h.get("Content-Security-Policy")).toBe(ATTACHMENT_CSP.download);
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Cache-Control")).toBe("private, no-store");
    expect(h.get("Content-Length")).toBe("1234");
  });

  it("inline imagen: sandbox y frame-ancestors 'self'", () => {
    const h = downloadHeaders(png, true);
    expect(h.get("Content-Disposition")).toMatch(/^inline; /);
    expect(h.get("Content-Security-Policy")).toMatch(/^sandbox; /);
    expect(h.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("inline PDF: SIN sandbox (Chrome no renderiza PDFs sandboxed), default-src 'none'", () => {
    const h = downloadHeaders(pdf, true);
    expect(h.get("Content-Disposition")).toMatch(/^inline; /);
    const csp = h.get("Content-Security-Policy")!;
    expect(csp).not.toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("tipo desconocido → octet-stream y nunca inline", () => {
    expect(safeContentType("text/html")).toBe("application/octet-stream");
    const h = downloadHeaders({ mimeType: "text/html", fileName: "x.html", sizeBytes: 1 }, true);
    expect(h.get("Content-Type")).toBe("application/octet-stream");
    expect(h.get("Content-Disposition")).toMatch(/^attachment; /);
  });

  it("filename ASCII de respaldo sin comillas ni separadores peligrosos", () => {
    expect(contentDisposition("attachment", 'a"b;c%d.pdf')).toBe(
      `attachment; filename="a_b_c_d.pdf"; filename*=UTF-8''a%22b%3Bc%25d.pdf`,
    );
  });
});

// ─── clamd (INSTREAM) ────────────────────────────────────────────────────────

describe("clamav", () => {
  let clamd: FakeClamd | null = null;
  afterEach(async () => {
    await clamd?.close();
    clamd = null;
  });

  it("parseClamdResponse: OK / FOUND / ERROR", () => {
    expect(parseClamdResponse("stream: OK\0")).toEqual({ clean: true });
    expect(parseClamdResponse("stream: Win.Test.EICAR_HDB-1 FOUND\0")).toEqual({
      clean: false,
      signature: "Win.Test.EICAR_HDB-1",
    });
    expect(() => parseClamdResponse("INSTREAM size limit exceeded. ERROR\0")).toThrow(ClamavUnavailableError);
  });

  it("envía el contenido completo en chunks y devuelve el veredicto", async () => {
    let received = 0;
    clamd = await fakeClamd((c) => {
      received = c.length;
      return markerVerdict(c);
    });
    const cfg = { host: "127.0.0.1", port: clamd.port, timeoutMs: 5000 };
    const big = Buffer.alloc(200 * 1024, 0x41); // > 1 chunk de 64 KiB
    expect(await scanWithClamav(Readable.from([big]), cfg)).toEqual({ clean: true });
    expect(received).toBe(big.length);

    const infected = Buffer.concat([Buffer.from("%PDF-1.4 "), Buffer.from(TEST_MARKER)]);
    expect(await scanWithClamav(Readable.from([infected]), cfg)).toEqual({ clean: false, signature: "Test.Marker" });
  });

  it("clamd caído → ClamavUnavailableError", async () => {
    const port = await closedPort();
    await expect(
      scanWithClamav(Readable.from([Buffer.from("x")]), { host: "127.0.0.1", port, timeoutMs: 2000 }),
    ).rejects.toBeInstanceOf(ClamavUnavailableError);
  });
});
