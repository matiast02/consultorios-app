process.env.TZ = "UTC";

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

vi.mock("@/lib/modules", () => ({
  checkModuleAccess: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { GET, POST } from "@/app/api/study-orders/route";
import {
  GET as GET_ONE,
  PUT,
  DELETE,
} from "@/app/api/study-orders/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/study-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/study-orders");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url, { method: "GET" });
}

function createPutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/study-orders/order-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createDeleteRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/study-orders/order-1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

const VALID_ITEMS = [
  { description: "Hemograma completo", type: "laboratorio", urgency: "normal" },
  { description: "Radiografia de torax", type: "imagen", urgency: "normal" },
];

const VALID_BODY = {
  userId: "user-1",
  patientId: "patient-1",
  items: VALID_ITEMS,
};

const STUDY_ORDER_RESULT = {
  id: "order-1",
  patientId: "patient-1",
  userId: "user-1",
  shiftId: null,
  items: JSON.stringify(VALID_ITEMS),
  status: "PENDING",
  resultNotes: null,
  createdAt: new Date("2026-04-09T10:00:00.000Z"),
  updatedAt: new Date("2026-04-09T10:00:00.000Z"),
  patient: { id: "patient-1", firstName: "Juan", lastName: "Perez" },
  user: { id: "user-1", name: "Dr. Smith", email: "test@test.com" },
};

// ---------------------------------------------------------------------------
// POST /api/study-orders
// ---------------------------------------------------------------------------

describe("POST /api/study-orders", () => {
  beforeEach(() => {
    resetAllMocks();
    // Autor de STUDY_ORDER_RESULT (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
  });

  it("crea orden de estudio valida", async () => {
    prismaMock.studyOrder.create.mockResolvedValue(STUDY_ORDER_RESULT);

    const res = await POST(createPostRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(expect.objectContaining({ id: "order-1" }));
    expect(prismaMock.studyOrder.create).toHaveBeenCalledOnce();
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await POST(createPostRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain("No autorizado");
  });

  it("rechaza datos invalidos", async () => {
    const res = await POST(createPostRequest({ userId: "user-1", patientId: "patient-1", items: [] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("invalidos");
    expect(json.details).toBeDefined();
  });

  it("guarda items como JSON string", async () => {
    prismaMock.studyOrder.create.mockResolvedValue(STUDY_ORDER_RESULT);

    await POST(createPostRequest(VALID_BODY));

    expect(prismaMock.studyOrder.create).toHaveBeenCalledOnce();
    const callArg = prismaMock.studyOrder.create.mock.calls[0][0];
    const parsedItems = JSON.parse(callArg.data.items);
    expect(parsedItems).toHaveLength(2);
    expect(parsedItems[0]).toEqual(
      expect.objectContaining({ description: "Hemograma completo", type: "laboratorio" })
    );
    expect(parsedItems[1]).toEqual(
      expect.objectContaining({ description: "Radiografia de torax", type: "imagen" })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/study-orders
// ---------------------------------------------------------------------------

describe("GET /api/study-orders", () => {
  beforeEach(() => {
    resetAllMocks();
    // Autor de STUDY_ORDER_RESULT (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
  });

  it("lista ordenes por patientId", async () => {
    prismaMock.studyOrder.findMany.mockResolvedValue([STUDY_ORDER_RESULT]);

    const res = await GET(createGetRequest({ patientId: "patient-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("order-1");
  });

  it("rechaza sin patientId", async () => {
    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("patientId");
  });
});

// ---------------------------------------------------------------------------
// PUT /api/study-orders/[id]
// ---------------------------------------------------------------------------

describe("PUT /api/study-orders/[id]", () => {
  beforeEach(() => {
    resetAllMocks();
    // Autor de STUDY_ORDER_RESULT (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
  });

  it("actualiza estado a COMPLETED", async () => {
    prismaMock.studyOrder.findUnique.mockResolvedValue(STUDY_ORDER_RESULT);
    prismaMock.studyOrder.update.mockResolvedValue({
      ...STUDY_ORDER_RESULT,
      status: "COMPLETED",
    });

    const res = await PUT(createPutRequest({ status: "COMPLETED" }), {
      params: Promise.resolve({ id: "order-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.studyOrder.update).toHaveBeenCalledOnce();
  });

  it("rechaza orden inexistente", async () => {
    prismaMock.studyOrder.findUnique.mockResolvedValue(null);

    const res = await PUT(createPutRequest({ status: "COMPLETED" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("no encontrada");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/study-orders/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/study-orders/[id]", () => {
  beforeEach(() => {
    resetAllMocks();
    // Autor de STUDY_ORDER_RESULT (user-1) con rol clínico.
    vi.mocked(getUserRole).mockResolvedValue("medic");
  });

  it("anula orden de estudio (no la borra) con motivo", async () => {
    prismaMock.studyOrder.findUnique.mockResolvedValue(STUDY_ORDER_RESULT);
    prismaMock.studyOrder.update.mockResolvedValue(STUDY_ORDER_RESULT);

    const res = await DELETE(createDeleteRequest({ annulReason: "Cargada por error" }), {
      params: Promise.resolve({ id: "order-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.annulled).toBe(true);
    expect(prismaMock.studyOrder.update).toHaveBeenCalled();
    expect(prismaMock.studyOrder.delete).not.toHaveBeenCalled();
  });

  it("rechaza anular sin motivo", async () => {
    prismaMock.studyOrder.findUnique.mockResolvedValue(STUDY_ORDER_RESULT);
    const res = await DELETE(createDeleteRequest(), {
      params: Promise.resolve({ id: "order-1" }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Política de acceso clínico (lista blanca de roles + scope por autor)
// ---------------------------------------------------------------------------

describe("study-orders: control de acceso clínico", () => {
  const ctx = { params: Promise.resolve({ id: "order-1" }) };
  const OTHER_AUTHOR = { ...STUDY_ORDER_RESULT, userId: "other-medic" };

  beforeEach(() => {
    resetAllMocks();
  });

  it("secretaria → 403 en GET lista, POST, GET/PUT/DELETE [id]", async () => {
    vi.mocked(getUserRole).mockResolvedValue("secretary");
    prismaMock.studyOrder.findUnique.mockResolvedValue(STUDY_ORDER_RESULT);

    expect((await GET(createGetRequest({ patientId: "patient-1" }))).status).toBe(403);
    expect((await POST(createPostRequest(VALID_BODY))).status).toBe(403);
    expect((await GET_ONE(createGetRequest(), ctx)).status).toBe(403);
    expect((await PUT(createPutRequest({ status: "COMPLETED" }), ctx)).status).toBe(403);
    expect((await DELETE(createDeleteRequest({ annulReason: "x" }), ctx)).status).toBe(403);
    expect(prismaMock.studyOrder.findMany).not.toHaveBeenCalled();
    expect(prismaMock.studyOrder.create).not.toHaveBeenCalled();
    expect(prismaMock.studyOrder.update).not.toHaveBeenCalled();
  });

  it("usuario sin rol → 403 (lista blanca, no lista negra)", async () => {
    vi.mocked(getUserRole).mockResolvedValue(null);
    expect((await GET(createGetRequest({ patientId: "patient-1" }))).status).toBe(403);
  });

  it("médico: el listado se filtra por autor + registra VIEW_SENSITIVE", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");
    await GET(createGetRequest({ patientId: "patient-1" }));

    expect(prismaMock.studyOrder.findMany.mock.calls[0][0].where).toEqual({
      patientId: "patient-1",
      userId: "user-1",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VIEW_SENSITIVE",
        resource: "study_order",
        resourceId: "patient-1",
      })
    );
  });

  it("admin: el listado no se filtra por autor", async () => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    await GET(createGetRequest({ patientId: "patient-1" }));

    expect(prismaMock.studyOrder.findMany.mock.calls[0][0].where).toEqual({
      patientId: "patient-1",
    });
  });

  it("médico no autor → 404 en GET/PUT/DELETE [id] (no revela existencia)", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");
    prismaMock.studyOrder.findUnique.mockResolvedValue(OTHER_AUTHOR);

    expect((await GET_ONE(createGetRequest(), ctx)).status).toBe(404);
    expect((await PUT(createPutRequest({ status: "COMPLETED" }), ctx)).status).toBe(404);
    expect((await DELETE(createDeleteRequest({ annulReason: "x" }), ctx)).status).toBe(404);
    expect(prismaMock.studyOrder.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("médico autor → 200 en GET [id] + VIEW_SENSITIVE", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");
    prismaMock.studyOrder.findUnique.mockResolvedValue(STUDY_ORDER_RESULT);

    const res = await GET_ONE(createGetRequest(), ctx);
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "study_order", resourceId: "order-1" })
    );
  });

  it("admin → 200 en GET [id] de otro autor", async () => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    prismaMock.studyOrder.findUnique.mockResolvedValue(OTHER_AUTHOR);
    expect((await GET_ONE(createGetRequest(), ctx)).status).toBe(200);
  });

  it("la anulación no guarda el motivo (texto libre) en audit", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");
    prismaMock.studyOrder.findUnique.mockResolvedValue(STUDY_ORDER_RESULT);

    const res = await DELETE(createDeleteRequest({ annulReason: "Paciente con VIH, repetir" }), ctx);
    expect(res.status).toBe(200);
    const call = vi.mocked(logAudit).mock.calls.find((c) => c[0].action === "DELETE");
    expect(call?.[0].details).toEqual({ patientId: "patient-1", annulled: true });
    expect(JSON.stringify(call?.[0])).not.toContain("VIH");
  });
});
