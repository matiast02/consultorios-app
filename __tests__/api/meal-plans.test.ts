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
  return new NextRequest("http://localhost:3000/api/meal-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/meal-plans");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url, { method: "GET" });
}

function createPutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/meal-plans/mp-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createDeleteRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/meal-plans/mp-1", {
    method: "DELETE",
  });
}

const validMealPlanBody = {
  userId: "user-1",
  patientId: "patient-1",
  title: "Plan semanal",
  targetCalories: 2000,
  proteinPct: 30,
  carbsPct: 50,
  fatPct: 20,
  meals: [
    {
      name: "Desayuno",
      time: "08:00",
      options: "Avena con frutas, yogur natural",
    },
  ],
};

const fakeMealPlan = {
  id: "mp-1",
  userId: "user-1",
  patientId: "patient-1",
  title: "Plan semanal",
  targetCalories: 2000,
  proteinPct: 30,
  carbsPct: 50,
  fatPct: 20,
  hydration: null,
  meals: JSON.stringify(validMealPlanBody.meals),
  avoidFoods: null,
  supplements: null,
  notes: null,
  shiftId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: "user-1", name: "Dr. Test", email: "test@test.com", firstName: "Test", lastName: "Doctor" },
};

// ─── Tests: /api/meal-plans (list + create) ────────────────────────────────

describe("POST /api/meal-plans", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("crea plan alimentario valido", async () => {
    prismaMock.mealPlan.create.mockResolvedValue(fakeMealPlan);

    const { POST } = await import("@/app/api/meal-plans/route");
    const req = createPostRequest(validMealPlanBody);

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(prismaMock.mealPlan.create).toHaveBeenCalledOnce();
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/meal-plans/route");
    const req = createPostRequest(validMealPlanBody);

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/meal-plans", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("lista planes por patientId", async () => {
    prismaMock.mealPlan.findMany.mockResolvedValue([fakeMealPlan]);

    const { GET } = await import("@/app/api/meal-plans/route");
    const req = createGetRequest({ patientId: "patient-1" });

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(prismaMock.mealPlan.findMany).toHaveBeenCalledOnce();
  });

  it("rechaza GET sin patientId", async () => {
    const { GET } = await import("@/app/api/meal-plans/route");
    const req = createGetRequest();

    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

// ─── Tests: /api/meal-plans/[id] (update + delete) ─────────────────────────

describe("PUT /api/meal-plans/[id]", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("actualiza plan existente", async () => {
    prismaMock.mealPlan.findUnique.mockResolvedValue(fakeMealPlan);
    prismaMock.mealPlan.update.mockResolvedValue({
      ...fakeMealPlan,
      title: "Plan actualizado",
    });

    const { PUT } = await import("@/app/api/meal-plans/[id]/route");
    const req = createPutRequest({ title: "Plan actualizado" });

    const context = { params: Promise.resolve({ id: "mp-1" }) };
    const res = await PUT(req, context);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.mealPlan.update).toHaveBeenCalledOnce();
  });
});

describe("DELETE /api/meal-plans/[id]", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("elimina plan", async () => {
    prismaMock.mealPlan.findUnique.mockResolvedValue(fakeMealPlan);
    prismaMock.mealPlan.delete.mockResolvedValue(fakeMealPlan);

    const { DELETE } = await import("@/app/api/meal-plans/[id]/route");
    const req = createDeleteRequest();

    const context = { params: Promise.resolve({ id: "mp-1" }) };
    const res = await DELETE(req, context);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("mp-1");
    expect(prismaMock.mealPlan.delete).toHaveBeenCalledOnce();
  });
});
