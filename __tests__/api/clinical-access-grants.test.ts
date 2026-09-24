import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks, authMock } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { PATCH } from "@/app/api/clinical-access-grants/[id]/route";
import { GET as listGrants, POST as createGrant } from "@/app/api/clinical-access-grants/route";

type Role = "medic" | "admin" | "secretary" | null;
const asRole = (role: Role) => vi.mocked(getUserRole).mockResolvedValue(role);

const DAY = 24 * 60 * 60 * 1000;
const ME = "user-1"; // usuario de la sesión mockeada

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });

const ctx = { params: Promise.resolve({ id: "g1" }) };
const patch = (body: unknown) => PATCH(req("http://x/api/clinical-access-grants/g1", "PATCH", body), ctx);

/** Fila completa de ClinicalAccessGrant (con el include de las rutas). */
const grantRow = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  patientId: "p1",
  grantedToUserId: "requester",
  requestedById: "requester",
  decidedById: null,
  status: "PENDING",
  scope: "FULL",
  sections: null,
  entryIds: null,
  reason: "Interconsulta: evaluar arritmia",
  consentType: null,
  consentEvidence: null,
  consentAt: null,
  startsAt: null,
  expiresAt: null,
  decidedAt: null,
  decisionNote: null,
  revokedAt: null,
  revokedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  patient: { id: "p1", firstName: "Ana", lastName: "López" },
  grantedTo: { id: "requester", name: "Dr R", firstName: "Raúl", lastName: "Méndez" },
  ...over,
});

const activeRow = (over: Record<string, unknown> = {}) =>
  grantRow({
    status: "ACTIVE",
    decidedById: "approver",
    startsAt: new Date(Date.now() - DAY),
    expiresAt: new Date(Date.now() + 10 * DAY),
    consentType: "WRITTEN",
    ...over,
  });

/** El actor (user-1) es tratante del paciente. */
const asTreating = () => prismaMock.prescription.count.mockResolvedValue(1);

const updateCall = () => prismaMock.clinicalAccessGrant.updateMany.mock.calls[0]?.[0];
const auditCall = () => vi.mocked(logAudit).mock.calls[0]?.[0];

beforeEach(() => {
  resetAllMocks();
  prismaMock.clinicalAccessGrant.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
});

describe("PATCH /api/clinical-access-grants/[id] — autenticación y validación", () => {
  it("sin sesión → 401", async () => {
    authMock.mockResolvedValueOnce(null);
    expect((await patch({ action: "cancel" })).status).toBe(401);
  });

  it("secretaria → 403 (lista blanca clínica)", async () => {
    asRole("secretary");
    expect((await patch({ action: "cancel" })).status).toBe(403);
    expect(prismaMock.clinicalAccessGrant.findUnique).not.toHaveBeenCalled();
  });

  it("acción desconocida o approve sin consentType → 400", async () => {
    asRole("medic");
    expect((await patch({ action: "borrar" })).status).toBe(400);
    expect((await patch({ action: "approve" })).status).toBe(400);
    expect((await patch({ action: "approve", consentType: "WRITTEN", days: 181 })).status).toBe(400);
    expect((await patch({ action: "reject" })).status).toBe(400);
  });

  it("consentimiento con fecha futura → 400", async () => {
    asRole("admin");
    const future = new Date(Date.now() + DAY).toISOString();
    expect((await patch({ action: "approve", consentType: "WRITTEN", consentAt: future })).status).toBe(400);
  });

  it("concesión inexistente → 404", async () => {
    asRole("admin");
    expect((await patch({ action: "cancel" })).status).toBe(404);
  });

  it("médico ajeno (ni beneficiario, ni tratante, ni aprobador) → 404 sin revelar existencia", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow());
    for (const action of [{ action: "approve", consentType: "WRITTEN" }, { action: "revoke" }, { action: "cancel" }]) {
      expect((await patch(action)).status).toBe(404);
    }
    expect(prismaMock.clinicalAccessGrant.updateMany).not.toHaveBeenCalled();
  });
});

describe("PATCH approve", () => {
  beforeEach(() => {
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow());
  });

  it("tratante → ACTIVE con consentimiento y vigencia default 30 días; audit GRANT_ACCESS sin textos libres", async () => {
    asRole("medic");
    asTreating();
    const res = await patch({ action: "approve", consentType: "VERBAL_RECORDED", consentEvidence: "Paciente presente, lo autoriza" });
    expect(res.status).toBe(200);

    const { where, data } = updateCall();
    expect(where).toEqual({ id: "g1", status: "PENDING" }); // update condicional (concurrencia)
    expect(data).toMatchObject({ status: "ACTIVE", decidedById: ME, consentType: "VERBAL_RECORDED" });
    expect(data.consentEvidence).toBe("Paciente presente, lo autoriza");
    expect(data.consentAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime() - data.startsAt.getTime()).toBe(30 * DAY);

    const audit = auditCall();
    expect(audit).toMatchObject({ action: "GRANT_ACCESS", resource: "clinical_access_grant", resourceId: "g1" });
    expect(audit.details).toMatchObject({ action: "approved", patientId: "p1", grantedToUserId: "requester", days: 30 });
    const serialized = JSON.stringify(audit.details);
    expect(serialized).not.toContain("arritmia");
    expect(serialized).not.toContain("autoriza");
  });

  it("admin → puede aprobar con vigencia explícita (≤ 180 días)", async () => {
    asRole("admin");
    const res = await patch({ action: "approve", consentType: "WRITTEN", days: 180 });
    expect(res.status).toBe(200);
    const { data } = updateCall();
    expect(data.expiresAt.getTime() - data.startsAt.getTime()).toBe(180 * DAY);
  });

  it("médico NO tratante con visibilidad (aprobó otra vez) no decide → 403", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow({ decidedById: ME }));
    expect((await patch({ action: "approve", consentType: "WRITTEN" })).status).toBe(403);
    expect(prismaMock.clinicalAccessGrant.updateMany).not.toHaveBeenCalled();
  });

  it("el beneficiario no puede aprobar su propia solicitud, aunque sea tratante → 403", async () => {
    asRole("medic");
    asTreating();
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow({ grantedToUserId: ME, requestedById: ME }));
    expect((await patch({ action: "approve", consentType: "WRITTEN" })).status).toBe(403);
    expect((await patch({ action: "reject", decisionNote: "No corresponde" })).status).toBe(403);
  });

  it("ya resuelta → 409", async () => {
    asRole("admin");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow({ status: "REJECTED" }));
    expect((await patch({ action: "approve", consentType: "WRITTEN" })).status).toBe(409);
  });

  it("paciente archivado → 409", async () => {
    asRole("admin");
    prismaMock.patient.findFirst.mockResolvedValue(null);
    expect((await patch({ action: "approve", consentType: "WRITTEN" })).status).toBe(409);
    expect(prismaMock.clinicalAccessGrant.updateMany).not.toHaveBeenCalled();
  });

  it("el beneficiario ya tiene otra concesión vigente → 409", async () => {
    asRole("admin");
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue({ id: "g0" });
    expect((await patch({ action: "approve", consentType: "WRITTEN" })).status).toBe(409);
  });

  it("decisión concurrente (otro la resolvió primero) → 409 y sin audit", async () => {
    asRole("admin");
    prismaMock.clinicalAccessGrant.updateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ action: "approve", consentType: "WRITTEN" })).status).toBe(409);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH reject", () => {
  beforeEach(() => {
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow());
  });

  it("tratante → REJECTED con motivo; audit REQUEST_ACCESS", async () => {
    asRole("medic");
    asTreating();
    const res = await patch({ action: "reject", decisionNote: "El paciente no autoriza" });
    expect(res.status).toBe(200);
    expect(updateCall().data).toMatchObject({ status: "REJECTED", decidedById: ME, decisionNote: "El paciente no autoriza" });
    expect(auditCall()).toMatchObject({ action: "REQUEST_ACCESS", details: { action: "rejected" } });
    expect(JSON.stringify(auditCall().details)).not.toContain("autoriza");
  });
});

describe("PATCH revoke", () => {
  it("tratante revoca una vigente → REVOKED; audit GRANT_ACCESS", async () => {
    asRole("medic");
    asTreating();
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(activeRow());
    const res = await patch({ action: "revoke", decisionNote: "Finalizó la interconsulta" });
    expect(res.status).toBe(200);
    expect(updateCall().where).toEqual({ id: "g1", status: "ACTIVE" });
    expect(updateCall().data).toMatchObject({ status: "REVOKED", revokedById: ME });
    expect(auditCall()).toMatchObject({ action: "GRANT_ACCESS", details: { action: "revoked" } });
  });

  it("quien la aprobó puede revocar aunque ya no sea tratante", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(activeRow({ decidedById: ME }));
    expect((await patch({ action: "revoke" })).status).toBe(200);
  });

  it("admin revoca", async () => {
    asRole("admin");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(activeRow());
    expect((await patch({ action: "revoke" })).status).toBe(200);
  });

  it("vencida (ACTIVE con expiresAt pasado) o pendiente → 409", async () => {
    asRole("admin");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(activeRow({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await patch({ action: "revoke" })).status).toBe(409);
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow());
    expect((await patch({ action: "revoke" })).status).toBe(409);
  });

  it("el beneficiario no revoca (usa cancel) → 403", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(activeRow({ grantedToUserId: ME }));
    expect((await patch({ action: "revoke" })).status).toBe(403);
  });
});

describe("PATCH cancel (beneficiario)", () => {
  it("PENDING propia → REJECTED; audit REQUEST_ACCESS cancelled", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow({ grantedToUserId: ME }));
    expect((await patch({ action: "cancel" })).status).toBe(200);
    expect(updateCall()).toMatchObject({ where: { status: "PENDING" }, data: { status: "REJECTED", decidedById: ME } });
    expect(auditCall()).toMatchObject({ action: "REQUEST_ACCESS", details: { action: "cancelled" } });
  });

  it("ACTIVE propia → REVOKED (renuncia); audit GRANT_ACCESS", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(activeRow({ grantedToUserId: ME }));
    expect((await patch({ action: "cancel" })).status).toBe(200);
    expect(updateCall()).toMatchObject({ where: { status: "ACTIVE" }, data: { status: "REVOKED", revokedById: ME } });
    expect(auditCall()).toMatchObject({ action: "GRANT_ACCESS", details: { action: "revoked", bySelf: true } });
  });

  it("un tratante (o admin) no puede cancelar la de otro → 403", async () => {
    asRole("medic");
    asTreating();
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow());
    expect((await patch({ action: "cancel" })).status).toBe(403);
    asRole("admin");
    expect((await patch({ action: "cancel" })).status).toBe(403);
  });

  it("propia ya rechazada → 409", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findUnique.mockResolvedValue(grantRow({ grantedToUserId: ME, status: "REJECTED" }));
    expect((await patch({ action: "cancel" })).status).toBe(409);
  });
});

describe("POST /api/clinical-access-grants", () => {
  const post = (body: unknown) => createGrant(req("http://x/api/clinical-access-grants", "POST", body));
  const valid = { patientId: "p1", scope: "PARTIAL", sections: ["antecedentes", "evoluciones"], reason: "Interconsulta por dolor torácico" };

  it("secretaria 403; admin 403 (solo médicos solicitan)", async () => {
    asRole("secretary");
    expect((await post(valid)).status).toBe(403);
    asRole("admin");
    expect((await post(valid)).status).toBe(403);
  });

  it("PARTIAL sin secciones ni asientos, o motivo corto → 400", async () => {
    asRole("medic");
    expect((await post({ ...valid, sections: [] })).status).toBe(400);
    expect((await post({ ...valid, reason: "corto" })).status).toBe(400);
    expect((await post({ ...valid, sections: ["todo"] })).status).toBe(400);
  });

  it("paciente inexistente → 404", async () => {
    asRole("medic");
    prismaMock.patient.findFirst.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
  });

  it("ya es tratante → 409", async () => {
    asRole("medic");
    asTreating();
    expect((await post(valid)).status).toBe(409);
    expect(prismaMock.clinicalAccessGrant.create).not.toHaveBeenCalled();
  });

  it("ya tiene una pendiente o vigente → 409", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue({ id: "g0", status: "PENDING" });
    expect((await post(valid)).status).toBe(409);
  });

  it("entryIds que no son del paciente → 400", async () => {
    asRole("medic");
    prismaMock.evolution.findMany.mockResolvedValue([{ id: "e1" }]);
    expect((await post({ ...valid, entryIds: ["e1", "e-de-otro"] })).status).toBe(400);
    expect(prismaMock.clinicalAccessGrant.create).not.toHaveBeenCalled();
  });

  it("crea PENDING a nombre propio; audit REQUEST_ACCESS sin el motivo", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      grantRow({ ...data, id: "gNew" }),
    );
    const res = await post(valid);
    expect(res.status).toBe(201);
    const { data } = prismaMock.clinicalAccessGrant.create.mock.calls[0][0];
    expect(data).toMatchObject({
      patientId: "p1",
      grantedToUserId: ME,
      requestedById: ME,
      status: "PENDING",
      scope: "PARTIAL",
      sections: JSON.stringify(["antecedentes", "evoluciones"]),
      entryIds: null,
    });
    const body = await res.json();
    expect(body.data).toMatchObject({ id: "gNew", status: "PENDING", sections: ["antecedentes", "evoluciones"] });
    expect(body.data.permissions).toEqual({ approve: false, reject: false, revoke: false, cancel: true });
    expect(auditCall()).toMatchObject({ action: "REQUEST_ACCESS", resourceId: "gNew", details: { action: "requested" } });
    expect(JSON.stringify(auditCall().details)).not.toContain("torácico");
  });

  it("FULL ignora secciones", async () => {
    asRole("medic");
    prismaMock.clinicalAccessGrant.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => grantRow(data));
    await post({ ...valid, scope: "FULL" });
    expect(prismaMock.clinicalAccessGrant.create.mock.calls[0][0].data).toMatchObject({ scope: "FULL", sections: null });
  });
});

describe("GET /api/clinical-access-grants", () => {
  const list = (qs = "") => listGrants(req(`http://x/api/clinical-access-grants${qs}`));
  const whereOf = () => prismaMock.clinicalAccessGrant.findMany.mock.calls[0][0].where.AND as unknown[];

  it("secretaria → 403; parámetros inválidos → 400", async () => {
    asRole("secretary");
    expect((await list()).status).toBe(403);
    asRole("medic");
    expect((await list("?box=todas")).status).toBe(400);
    expect((await list("?status=VIGENTE")).status).toBe(400);
  });

  it("médico sin box → propias OR a decidir (pacientes que trata, no propias)", async () => {
    asRole("medic");
    await list("?patientId=p1");
    const and = whereOf();
    expect(and).toContainEqual({ patientId: "p1" });
    const scope = and.find((w) => typeof w === "object" && w !== null && "OR" in w) as { OR: unknown[] };
    expect(scope.OR[0]).toEqual({ grantedToUserId: ME });
    expect(scope.OR[1]).toMatchObject({ grantedToUserId: { not: ME }, patient: { OR: expect.any(Array) } });
  });

  it("box=to-decide sin status → solo PENDING", async () => {
    asRole("medic");
    await list("?box=to-decide");
    expect(whereOf()).toContainEqual({ status: "PENDING" });
  });

  it("status=ACTIVE filtra por vigencia real (no solo el estado guardado)", async () => {
    asRole("admin");
    await list("?status=ACTIVE");
    const active = whereOf()[0] as Record<string, unknown>;
    expect(active).toMatchObject({ status: "ACTIVE", startsAt: { lte: expect.any(Date) }, expiresAt: { gt: expect.any(Date) } });
  });

  it("admin → todas; serializa estado efectivo y permisos", async () => {
    asRole("admin");
    prismaMock.clinicalAccessGrant.findMany.mockResolvedValue([
      activeRow({ id: "gVencida", expiresAt: new Date(Date.now() - 1000) }),
      grantRow({ id: "gPend" }),
    ]);
    const body = await (await list()).json();
    expect(whereOf()).toEqual([]);
    const [vencida, pend] = body.data;
    expect(vencida).toMatchObject({ id: "gVencida", status: "EXPIRED", isActive: false });
    expect(vencida.permissions.revoke).toBe(false);
    expect(pend.permissions).toMatchObject({ approve: true, reject: true });
  });
});
