import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { POST as deliver } from "@/app/api/patients/[id]/hc-copy-requests/[requestId]/deliver/route";
import { POST as cancel } from "@/app/api/patients/[id]/hc-copy-requests/[requestId]/cancel/route";
import {
  GET as listForPatient,
  POST as register,
} from "@/app/api/patients/[id]/hc-copy-requests/route";
import { GET as listGlobal } from "@/app/api/hc-copy-requests/route";

type Role = "medic" | "admin" | "secretary" | null;
const asRole = (role: Role) => vi.mocked(getUserRole).mockResolvedValue(role);

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });

const reqCtx = { params: Promise.resolve({ id: "p1", requestId: "r1" }) };
const patientCtx = { params: Promise.resolve({ id: "p1" }) };
const DELIVER_URL = "http://x/api/patients/p1/hc-copy-requests/r1/deliver";

function hcRequest(status: "PENDING" | "DELIVERED" | "CANCELLED") {
  return {
    id: "r1",
    patientId: "p1",
    requesterType: "PATIENT",
    requesterName: "Ana Pérez",
    requesterDni: "30111222",
    authorizationNote: null,
    reason: null,
    status,
    registeredById: "sec-1",
    requestedAt: new Date("2026-09-22T12:00:00Z"),
    dueAt: new Date("2026-09-24T12:00:00Z"),
    deliveredAt: status === "DELIVERED" ? new Date("2026-09-23T12:00:00Z") : null,
    deliveredById: status === "DELIVERED" ? "medic-x" : null,
    deliveryNote: null,
    documentHash: status === "DELIVERED" ? "f".repeat(64) : null,
    createdAt: new Date("2026-09-22T12:00:00Z"),
    updatedAt: new Date("2026-09-22T12:00:00Z"),
  };
}

function seedPatient() {
  prismaMock.patient.findUnique.mockResolvedValue({
    id: "p1",
    firstName: "Ana",
    lastName: "Pérez",
    dni: "30111222",
    birthDate: null,
    sex: "F",
    email: null,
    telephone: null,
    address: null,
    province: null,
    country: null,
    osId: null,
    osNumber: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    consentType: null,
    consentGivenAt: null,
    deletedAt: null,
    os: null,
    insurances: [],
  });
  prismaMock.clinicalRecord.findUnique.mockResolvedValue({
    id: "cr1",
    patientId: "p1",
    bloodType: "0+",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  prismaMock.clinicSettings.findUnique.mockResolvedValue({ name: "Consultorio Test" });
  prismaMock.user.findUnique.mockResolvedValue({
    name: "medico",
    firstName: "Laura",
    lastName: "Gómez",
    licenseNumber: "MN 1",
  });
}

const auditCalls = () => vi.mocked(logAudit).mock.calls.map((c) => c[0]);

beforeEach(() => {
  resetAllMocks();
});

// ── deliver: permisos ────────────────────────────────────────────────────────
describe("POST …/hc-copy-requests/[requestId]/deliver — permisos", () => {
  it("sin sesión → 401", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await deliver(req(DELIVER_URL, "POST"), reqCtx);
    expect(res.status).toBe(401);
    expect(prismaMock.hcCopyRequest.findFirst).not.toHaveBeenCalled();
  });

  it("secretaria → 403 (registra, pero no genera ni ve el PDF)", async () => {
    asRole("secretary");
    const res = await deliver(req(DELIVER_URL, "POST"), reqCtx);
    expect(res.status).toBe(403);
    expect(prismaMock.hcCopyRequest.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.hcCopyRequest.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("usuario sin rol → 403 (lista blanca)", async () => {
    asRole(null);
    const res = await deliver(req(DELIVER_URL, "POST"), reqCtx);
    expect(res.status).toBe(403);
    expect(prismaMock.hcCopyRequest.findFirst).not.toHaveBeenCalled();
  });

  it("solicitud de otro paciente → 404 (la búsqueda se acota por patientId)", async () => {
    asRole("medic");
    prismaMock.hcCopyRequest.findFirst.mockResolvedValue(null);
    const res = await deliver(req(DELIVER_URL, "POST"), reqCtx);
    expect(res.status).toBe(404);
    expect(prismaMock.hcCopyRequest.findFirst.mock.calls[0][0].where).toEqual({
      id: "r1",
      patientId: "p1",
    });
  });

  it("solicitud cancelada → 409", async () => {
    asRole("admin");
    prismaMock.hcCopyRequest.findFirst.mockResolvedValue(hcRequest("CANCELLED"));
    const res = await deliver(req(DELIVER_URL, "POST"), reqCtx);
    expect(res.status).toBe(409);
    expect(prismaMock.hcCopyRequest.updateMany).not.toHaveBeenCalled();
  });

  it("deliveryNote demasiado larga → 400", async () => {
    asRole("medic");
    const res = await deliver(req(DELIVER_URL, "POST", { deliveryNote: "x".repeat(501) }), reqCtx);
    expect(res.status).toBe(400);
    expect(prismaMock.hcCopyRequest.findFirst).not.toHaveBeenCalled();
  });
});

// ── deliver: entrega ─────────────────────────────────────────────────────────
describe("POST …/deliver — entrega", () => {
  it("médico (sin relación con el paciente) + PENDING → PDF, DELIVERED y auditoría", async () => {
    asRole("medic");
    seedPatient();
    prismaMock.hcCopyRequest.findFirst.mockResolvedValue(hcRequest("PENDING"));
    prismaMock.hcCopyRequest.updateMany.mockResolvedValue({ count: 1 });

    const res = await deliver(
      req(DELIVER_URL, "POST", { deliveryNote: "Entregada en mano" }),
      reqCtx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="HC-Perez-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
    const hash = res.headers.get("X-Document-Hash");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(body.toString("latin1")).toContain(hash!);

    // La copia es completa: la evolución NO se filtra por el médico que emite.
    expect(prismaMock.evolution.findMany.mock.calls[0][0].where).toEqual({
      clinicalRecord: { patientId: "p1" },
    });

    const update = prismaMock.hcCopyRequest.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "r1", patientId: "p1", status: "PENDING" });
    expect(update.data).toMatchObject({
      status: "DELIVERED",
      deliveredById: "user-1",
      deliveryNote: "Entregada en mano",
      documentHash: hash,
    });
    expect(update.data.deliveredAt).toBeInstanceOf(Date);

    const audits = auditCalls();
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      userId: "user-1",
      action: "EXPORT_HC",
      resource: "hc_copy_request",
      resourceId: "r1",
      details: { patientId: "p1", requesterType: "PATIENT", documentHash: hash, reissue: false },
    });
    expect(audits[1]).toMatchObject({
      action: "VIEW_SENSITIVE",
      resource: "clinical_record",
      resourceId: "cr1",
    });
  });

  it("admin + DELIVERED → vuelve a descargar sin tocar la entrega original y audita de nuevo", async () => {
    asRole("admin");
    seedPatient();
    prismaMock.hcCopyRequest.findFirst.mockResolvedValue(hcRequest("DELIVERED"));

    const res = await deliver(req(DELIVER_URL, "POST"), reqCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(prismaMock.hcCopyRequest.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.hcCopyRequest.update).not.toHaveBeenCalled();
    const audits = auditCalls();
    expect(audits.map((a) => a.action)).toEqual(["EXPORT_HC", "VIEW_SENSITIVE"]);
    expect(audits[0].details).toMatchObject({ reissue: true });
  });

  it("carrera: se canceló entre la lectura y el update → 409 y sin auditoría de exportación", async () => {
    asRole("medic");
    seedPatient();
    prismaMock.hcCopyRequest.findFirst.mockResolvedValue(hcRequest("PENDING"));
    prismaMock.hcCopyRequest.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.hcCopyRequest.findUnique.mockResolvedValue({ status: "CANCELLED" });

    const res = await deliver(req(DELIVER_URL, "POST"), reqCtx);
    expect(res.status).toBe(409);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

// ── registrar / cancelar / listar ────────────────────────────────────────────
describe("registro, cancelación y listados", () => {
  it("secretaria registra una solicitud: dueAt = requestedAt + 48 h, auditada", async () => {
    asRole("secretary");
    prismaMock.patient.findUnique.mockResolvedValue({ id: "p1" });
    prismaMock.hcCopyRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "r-new",
      status: "PENDING",
      deliveredAt: null,
      deliveredById: null,
      deliveryNote: null,
      documentHash: null,
      ...data,
    }));

    const res = await register(
      req("http://x/api/patients/p1/hc-copy-requests", "POST", {
        requesterType: "PATIENT",
        requesterName: "Ana Pérez",
      }),
      patientCtx,
    );
    expect(res.status).toBe(201);
    const data = prismaMock.hcCopyRequest.create.mock.calls[0][0].data;
    expect(data.registeredById).toBe("user-1");
    expect(data.dueAt.getTime() - data.requestedAt.getTime()).toBe(48 * 60 * 60 * 1000);
    expect(auditCalls()[0]).toMatchObject({ action: "CREATE", resource: "hc_copy_request", resourceId: "r-new" });
  });

  it("heredero sin constancia de vínculo/autorización → 400", async () => {
    asRole("secretary");
    const res = await register(
      req("http://x/api/patients/p1/hc-copy-requests", "POST", {
        requesterType: "HEIR",
        requesterName: "Juan Pérez",
      }),
      patientCtx,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.hcCopyRequest.create).not.toHaveBeenCalled();
  });

  it("rol desconocido no puede listar → 403", async () => {
    asRole(null);
    const res = await listForPatient(req("http://x/api/patients/p1/hc-copy-requests"), patientCtx);
    expect(res.status).toBe(403);
  });

  it("secretaria cancela una PENDING; una DELIVERED no se puede cancelar (409)", async () => {
    asRole("secretary");
    prismaMock.hcCopyRequest.findFirst.mockResolvedValue({ id: "r1", status: "PENDING" });
    prismaMock.hcCopyRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.hcCopyRequest.findUnique.mockResolvedValue(hcRequest("CANCELLED"));
    const ok = await cancel(req("http://x/cancel", "POST"), reqCtx);
    expect(ok.status).toBe(200);
    expect(prismaMock.hcCopyRequest.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "r1", patientId: "p1", status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    prismaMock.hcCopyRequest.findFirst.mockResolvedValue({ id: "r1", status: "DELIVERED" });
    const conflict = await cancel(req("http://x/cancel", "POST"), reqCtx);
    expect(conflict.status).toBe(409);
  });

  it("pendientes globales: solo admin", async () => {
    asRole("medic");
    expect((await listGlobal(req("http://x/api/hc-copy-requests?status=PENDING"))).status).toBe(403);

    asRole("admin");
    prismaMock.hcCopyRequest.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const res = await listGlobal(req("http://x/api/hc-copy-requests?status=PENDING"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ count: 3, overdue: 1, items: [] });
  });
});
