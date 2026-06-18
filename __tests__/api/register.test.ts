import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";

// Mock rate-limit before importing the route
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    remaining: 5,
    resetAt: Date.now() + 60000,
  }),
}));

// Mock audit logging
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { POST } from "@/app/api/register/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: "Juan Perez",
  email: "juan@example.com",
  password: "Password1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/register", () => {
  beforeEach(() => {
    resetAllMocks();
    // Registration is admin-only: default the requester to an admin session.
    authMock.mockResolvedValue({
      user: { id: "admin-1", email: "admin@test.com", role: "admin" },
    });
    vi.mocked(getUserRole).mockResolvedValue("admin");
  });

  // 0 ─ Rejects non-admin requesters (registration is admin-only)
  it("rechaza si el solicitante no es admin", async () => {
    vi.mocked(getUserRole).mockResolvedValue("secretary");

    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  // 0b ─ Rejects unauthenticated requesters
  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  // 1 ─ Registers valid user
  it("registra usuario valido", async () => {
    // No existing user with this email
    prismaMock.user.findUnique.mockResolvedValue(null);

    // User creation succeeds
    prismaMock.user.create.mockResolvedValue({
      id: "new-user-1",
      name: "Juan Perez",
      email: "juan@example.com",
      createdAt: new Date(),
    });

    const res = await POST(createRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.message).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("juan@example.com");
  });

  // 2 ─ Rejects duplicate email
  it("rechaza email duplicado", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "existing-1",
      email: "juan@example.com",
      name: "Existing User",
    });

    const res = await POST(createRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBeDefined();
  });

  // 3 ─ Rejects weak password (no uppercase)
  it("rechaza password debil", async () => {
    const res = await POST(
      createRequest({
        ...VALID_BODY,
        password: "password1", // no uppercase letter
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // 4 ─ Rejects invalid email
  it("rechaza email invalido", async () => {
    const res = await POST(
      createRequest({
        ...VALID_BODY,
        email: "not-an-email",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});
