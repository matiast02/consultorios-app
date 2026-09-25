import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { vi } from "vitest";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

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

function createDeleteRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/meal-plans/mp-1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
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
    // Autor de fakeMealPlan (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
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
    // Autor de fakeMealPlan (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
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
    // Autor de fakeMealPlan (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
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
    // Autor de fakeMealPlan (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
  });

  it("anula plan (no lo borra) con motivo", async () => {
    prismaMock.mealPlan.findUnique.mockResolvedValue(fakeMealPlan);
    prismaMock.mealPlan.update.mockResolvedValue(fakeMealPlan);

    const { DELETE } = await import("@/app/api/meal-plans/[id]/route");
    const req = createDeleteRequest({ annulReason: "Cargado por error" });

    const context = { params: Promise.resolve({ id: "mp-1" }) };
    const res = await DELETE(req, context);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.annulled).toBe(true);
    expect(prismaMock.mealPlan.update).toHaveBeenCalled();
    expect(prismaMock.mealPlan.delete).not.toHaveBeenCalled();
  });

  it("rechaza anular sin motivo", async () => {
    prismaMock.mealPlan.findUnique.mockResolvedValue(fakeMealPlan);
    const { DELETE } = await import("@/app/api/meal-plans/[id]/route");
    const res = await DELETE(createDeleteRequest(), {
      params: Promise.resolve({ id: "mp-1" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Tests: política de acceso clínico ──────────────────────────────────────

describe("meal-plans: control de acceso clínico", () => {
  const ctx = () => ({ params: Promise.resolve({ id: "mp-1" }) });
  const otherAuthorPlan = { ...fakeMealPlan, userId: "other-medic" };

  beforeEach(() => {
    resetAllMocks();
  });

  it("secretaria → 403 en todos los métodos", async () => {
    vi.mocked(getUserRole).mockResolvedValue("secretary");
    prismaMock.mealPlan.findUnique.mockResolvedValue(fakeMealPlan);
    const list = await import("@/app/api/meal-plans/route");
    const one = await import("@/app/api/meal-plans/[id]/route");

    expect((await list.GET(createGetRequest({ patientId: "patient-1" }))).status).toBe(403);
    expect((await list.POST(createPostRequest(validMealPlanBody))).status).toBe(403);
    expect((await one.GET(createGetRequest(), ctx())).status).toBe(403);
    expect((await one.PUT(createPutRequest({ title: "x" }), ctx())).status).toBe(403);
    expect((await one.DELETE(createDeleteRequest({ annulReason: "x" }), ctx())).status).toBe(403);
    expect(prismaMock.mealPlan.findMany).not.toHaveBeenCalled();
    expect(prismaMock.mealPlan.update).not.toHaveBeenCalled();
  });

  it("médico: listado filtrado por autor + VIEW_SENSITIVE", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");
    const { GET } = await import("@/app/api/meal-plans/route");
    await GET(createGetRequest({ patientId: "patient-1" }));

    expect(prismaMock.mealPlan.findMany.mock.calls[0][0].where).toEqual({
      patientId: "patient-1",
      userId: "user-1",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "meal_plan", resourceId: "patient-1" })
    );
  });

  it("admin: listado sin filtro por autor", async () => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    const { GET } = await import("@/app/api/meal-plans/route");
    await GET(createGetRequest({ patientId: "patient-1" }));
    expect(prismaMock.mealPlan.findMany.mock.calls[0][0].where).toEqual({ patientId: "patient-1" });
  });

  it("médico no autor → 404 en GET/PUT/DELETE [id]", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");
    prismaMock.mealPlan.findUnique.mockResolvedValue(otherAuthorPlan);
    const one = await import("@/app/api/meal-plans/[id]/route");

    expect((await one.GET(createGetRequest(), ctx())).status).toBe(404);
    expect((await one.PUT(createPutRequest({ title: "x" }), ctx())).status).toBe(404);
    expect((await one.DELETE(createDeleteRequest({ annulReason: "x" }), ctx())).status).toBe(404);
    expect(prismaMock.mealPlan.update).not.toHaveBeenCalled();
  });

  it("admin ve el plan de otro autor (200) pero no lo anula (403, solo autor)", async () => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    prismaMock.mealPlan.findUnique.mockResolvedValue(otherAuthorPlan);
    const one = await import("@/app/api/meal-plans/[id]/route");

    expect((await one.GET(createGetRequest(), ctx())).status).toBe(200);
    expect((await one.DELETE(createDeleteRequest({ annulReason: "x" }), ctx())).status).toBe(403);
  });

  it("audit sin texto libre: ni título al crear ni motivo al anular", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");
    prismaMock.mealPlan.create.mockResolvedValue(fakeMealPlan);
    prismaMock.mealPlan.findUnique.mockResolvedValue(fakeMealPlan);
    const list = await import("@/app/api/meal-plans/route");
    const one = await import("@/app/api/meal-plans/[id]/route");

    await list.POST(createPostRequest(validMealPlanBody));
    await one.DELETE(createDeleteRequest({ annulReason: "Motivo clínico" }), ctx());

    const calls = vi.mocked(logAudit).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.action === "CREATE")?.details).toEqual({ patientId: "patient-1" });
    expect(calls.find((c) => c.action === "DELETE")?.details).toEqual({ patientId: "patient-1", annulled: true });
  });
});
