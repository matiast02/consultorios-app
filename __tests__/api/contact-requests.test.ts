import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";

import { GET } from "@/app/api/admin/contact-requests/route";
import { PATCH, DELETE } from "@/app/api/admin/contact-requests/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRequest(status?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/admin/contact-requests");
  if (status) url.searchParams.set("status", status);
  return new NextRequest(url, { method: "GET" });
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/contact-requests/req-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/contact-requests/req-1", {
    method: "DELETE",
  });
}

const params = (id = "req-1") => ({ params: Promise.resolve({ id }) });

const fakeRequest = {
  id: "req-1",
  fullName: "Ana Gómez",
  phone: "+5491122334455",
  email: null,
  healthInsurance: null,
  specializationId: null,
  specialization: null,
  preferredDay: null,
  message: "Quisiera un turno",
  status: "new",
  whatsappOpened: false,
  createdAt: new Date(),
  readAt: null,
};

// ─── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/admin/contact-requests", () => {
  beforeEach(() => {
    resetAllMocks();
    vi.mocked(getUserRole).mockResolvedValue("secretary");
  });

  it("lista solicitudes para roles permitidos", async () => {
    prismaMock.contactRequest.findMany.mockResolvedValue([fakeRequest]);

    const res = await GET(getRequest("new"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("rechaza roles no permitidos (medic)", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");

    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("rechaza status invalido", async () => {
    const res = await GET(getRequest("garbage"));
    expect(res.status).toBe(400);
  });
});

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/contact-requests/[id]", () => {
  beforeEach(() => {
    resetAllMocks();
    vi.mocked(getUserRole).mockResolvedValue("secretary");
  });

  it("actualiza el estado a leida", async () => {
    prismaMock.contactRequest.update.mockResolvedValue({
      ...fakeRequest,
      status: "read",
      readAt: new Date(),
    });

    const res = await PATCH(patchRequest({ status: "read" }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.contactRequest.update).toHaveBeenCalledOnce();
  });

  it("rechaza status invalido", async () => {
    const res = await PATCH(patchRequest({ status: "nope" }), params());
    expect(res.status).toBe(400);
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await PATCH(patchRequest({ status: "read" }), params());
    expect(res.status).toBe(401);
  });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE /api/admin/contact-requests/[id]", () => {
  beforeEach(() => {
    resetAllMocks();
    vi.mocked(getUserRole).mockResolvedValue("admin");
  });

  it("elimina una solicitud existente", async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValue(fakeRequest);
    prismaMock.contactRequest.delete.mockResolvedValue(fakeRequest);

    const res = await DELETE(deleteRequest(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(prismaMock.contactRequest.delete).toHaveBeenCalledOnce();
  });

  it("devuelve 404 si no existe", async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), params());
    expect(res.status).toBe(404);
    expect(prismaMock.contactRequest.delete).not.toHaveBeenCalled();
  });

  it("rechaza roles no permitidos (medic)", async () => {
    vi.mocked(getUserRole).mockResolvedValue("medic");

    const res = await DELETE(deleteRequest(), params());
    expect(res.status).toBe(403);
  });
});
