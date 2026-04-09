import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { vi } from "vitest";

// ─── Module-level mocks ─────────────────────────────────────────────────────

vi.mock("@/lib/modules", () => ({
  checkModuleAccess: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/profession-configs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeProfessionConfig = {
  id: "pc-1",
  code: "nutricion",
  name: "Nutricion",
  professionalLabel: "Nutricionista",
  patientLabel: "Paciente",
  prescriptionLabel: "Plan alimentario",
  evolutionLabel: "Evolucion",
  clinicalRecordLabel: "Ficha clinica",
  enabledModules: JSON.stringify(["prescriptions"]),
  clinicalFields: JSON.stringify(["anthropometricTracker"]),
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { specializations: 0 },
};

const validCreateBody = {
  code: "nutricion",
  name: "Nutricion",
  professionalLabel: "Nutricionista",
  patientLabel: "Paciente",
  prescriptionLabel: "Plan alimentario",
  evolutionLabel: "Evolucion",
  clinicalRecordLabel: "Ficha clinica",
  enabledModules: ["prescriptions"],
  clinicalFields: ["anthropometricTracker"],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/profession-configs", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("lista configuraciones de profesion", async () => {
    prismaMock.professionConfig.findMany.mockResolvedValue([fakeProfessionConfig]);

    const { GET } = await import("@/app/api/profession-configs/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(prismaMock.professionConfig.findMany).toHaveBeenCalledOnce();
  });
});

describe("POST /api/profession-configs", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("crea configuracion valida", async () => {
    // Auth mock returns secretary role
    authMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "test@test.com", role: "secretary" },
    });
    prismaMock.professionConfig.findUnique.mockResolvedValue(null);
    prismaMock.professionConfig.create.mockResolvedValue(fakeProfessionConfig);

    const { POST } = await import("@/app/api/profession-configs/route");
    const req = createPostRequest(validCreateBody);

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(prismaMock.professionConfig.create).toHaveBeenCalledOnce();
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/profession-configs/route");
    const req = createPostRequest(validCreateBody);

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
