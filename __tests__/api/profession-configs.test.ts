import { describe, it, expect, beforeEach } from "vitest";
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

// NOTE: /api/profession-configs is read-only (only GET is exported, both at
// the collection and [id] routes). Profession configs are seeded/managed at the
// data layer, so there are no create/update/delete endpoints to test here.

describe("GET /api/profession-configs — auth", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/profession-configs/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
