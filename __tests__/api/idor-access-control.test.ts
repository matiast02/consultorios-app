import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { isMedic, isSecretary } from "@/lib/auth-utils";
import { checkModuleAccess } from "@/lib/modules";

vi.mock("@/lib/modules", () => ({
  checkModuleAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GET as getEvolution } from "@/app/api/patients/[id]/evolutions/[evolutionId]/route";
import {
  GET as getMealPlan,
  PUT as putMealPlan,
} from "@/app/api/meal-plans/[id]/route";
import {
  GET as getStudyOrder,
  PUT as putStudyOrder,
  DELETE as delStudyOrder,
} from "@/app/api/study-orders/[id]/route";

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });

const evoCtx = { params: Promise.resolve({ id: "p1", evolutionId: "e1" }) };
const idCtx = { params: Promise.resolve({ id: "x1" }) };

beforeEach(() => {
  resetAllMocks();
  vi.mocked(isMedic).mockResolvedValue(false);
  vi.mocked(isSecretary).mockResolvedValue(false);
  vi.mocked(checkModuleAccess).mockResolvedValue(true);
});

// ── Evolution single GET — must not leak clinical data ────────────────────────
describe("IDOR: GET evolution [evolutionId]", () => {
  it("secretaria → 403 (dato clínico)", async () => {
    vi.mocked(isSecretary).mockResolvedValue(true);
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(403);
  });

  it("médico que no es el autor → 404 (scope por médico)", async () => {
    vi.mocked(isMedic).mockResolvedValue(true);
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
    // Scoped query (userId filter) finds nothing → not the author
    prismaMock.evolution.findFirst.mockResolvedValue(null);
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(404);
  });

  it("admin → 200 (ve todo)", async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", userId: "other" });
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(200);
  });
});

// ── Meal plan single GET/PUT — must require module access ──────────────────────
describe("IDOR: meal-plan [id] requiere módulo", () => {
  it("GET sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await getMealPlan(req("http://x/api/meal-plans/x1"), idCtx);
    expect(res.status).toBe(403);
  });

  it("PUT sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await putMealPlan(req("http://x/api/meal-plans/x1", "PUT", { title: "x" }), idCtx);
    expect(res.status).toBe(403);
  });
});

// ── Study order single GET/PUT/DELETE — must require module access ─────────────
describe("IDOR: study-order [id] requiere módulo", () => {
  it("GET sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await getStudyOrder(req("http://x/api/study-orders/x1"), idCtx);
    expect(res.status).toBe(403);
  });

  it("PUT sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await putStudyOrder(req("http://x/api/study-orders/x1", "PUT", { status: "PENDING" }), idCtx);
    expect(res.status).toBe(403);
  });

  it("DELETE sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await delStudyOrder(req("http://x/api/study-orders/x1", "DELETE"), idCtx);
    expect(res.status).toBe(403);
  });
});
