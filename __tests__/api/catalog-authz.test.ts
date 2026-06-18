import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";

import { POST as createSpecialization } from "@/app/api/specializations/route";
import { POST as createHealthInsurance } from "@/app/api/health-insurance/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function postReq(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function asRole(role: string | null) {
  authMock.mockResolvedValue(
    role === null ? null : { user: { id: "u1", email: "t@t.com", role } }
  );
}

// These catalog mutations are admin-only. Non-admin authenticated users (medic,
// secretary) must be rejected with 403 even though they hold a valid session.

describe("Catalog mutations require admin role", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.specialization.findFirst.mockResolvedValue(null);
    prismaMock.specialization.create.mockResolvedValue({ id: "s1", name: "X" });
    prismaMock.healthInsurance.findFirst.mockResolvedValue(null);
    prismaMock.healthInsurance.create.mockResolvedValue({ id: "h1", name: "X" });
  });

  it("POST /api/specializations — 403 para médico", async () => {
    asRole("medic");
    const res = await createSpecialization(
      postReq("http://localhost/api/specializations", { name: "Cardio" })
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/specializations — 403 para secretaria", async () => {
    asRole("secretary");
    const res = await createSpecialization(
      postReq("http://localhost/api/specializations", { name: "Cardio" })
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/specializations — admin pasa el gate (201)", async () => {
    asRole("admin");
    const res = await createSpecialization(
      postReq("http://localhost/api/specializations", { name: "Cardio" })
    );
    expect(res.status).toBe(201);
  });

  it("POST /api/health-insurance — secretaria SÍ puede (201)", async () => {
    asRole("secretary");
    const res = await createHealthInsurance(
      postReq("http://localhost/api/health-insurance", { name: "OSDE" })
    );
    expect(res.status).toBe(201);
  });

  it("POST /api/health-insurance — 403 para médico", async () => {
    asRole("medic");
    const res = await createHealthInsurance(
      postReq("http://localhost/api/health-insurance", { name: "OSDE" })
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/health-insurance — admin pasa el gate (201)", async () => {
    asRole("admin");
    const res = await createHealthInsurance(
      postReq("http://localhost/api/health-insurance", { name: "OSDE" })
    );
    expect(res.status).toBe(201);
  });

  it("POST /api/specializations — 401 sin sesión", async () => {
    asRole(null);
    const res = await createSpecialization(
      postReq("http://localhost/api/specializations", { name: "Cardio" })
    );
    expect(res.status).toBe(401);
  });
});
