import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { GET, POST } from "@/app/api/consultation-types/route";
import { DELETE } from "@/app/api/consultation-types/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/consultation-types");
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/consultation-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createDeleteRequest(id: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/consultation-types/${id}`,
    { method: "DELETE" }
  );
}

function routeParams(id = "type-1") {
  return { params: Promise.resolve({ id }) };
}

const VALID_TYPE = {
  name: "Control general",
  durationMinutes: 30,
};

const TYPE_RESULT = {
  id: "type-1",
  name: "Control general",
  durationMinutes: 30,
  color: null,
  isDefault: false,
  _count: { shifts: 0 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/consultation-types", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("lista tipos de consulta", async () => {
    prismaMock.consultationType.findMany.mockResolvedValue([
      TYPE_RESULT,
      { ...TYPE_RESULT, id: "type-2", name: "Primera vez" },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/consultation-types", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("crea tipo valido", async () => {
    // No duplicate name
    prismaMock.consultationType.findFirst.mockResolvedValue(null);
    prismaMock.consultationType.create.mockResolvedValue(TYPE_RESULT);

    const res = await POST(createPostRequest(VALID_TYPE));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Control general");
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await POST(createPostRequest(VALID_TYPE));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/consultation-types/[id]", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("elimina tipo sin turnos asociados", async () => {
    prismaMock.consultationType.findUnique.mockResolvedValue({
      ...TYPE_RESULT,
      _count: { shifts: 0 },
    });
    prismaMock.consultationType.delete.mockResolvedValue(TYPE_RESULT);

    const res = await DELETE(createDeleteRequest("type-1"), routeParams("type-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("rechaza eliminar tipo con turnos", async () => {
    prismaMock.consultationType.findUnique.mockResolvedValue({
      ...TYPE_RESULT,
      _count: { shifts: 5 },
    });

    const res = await DELETE(createDeleteRequest("type-1"), routeParams("type-1"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toContain("turnos asociados");
  });
});
