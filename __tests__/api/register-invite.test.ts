import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 5, resetAt: Date.now() + 60000 }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/password-setup-email", () => ({
  sendInvitationEmail: vi.fn(),
}));

import { POST } from "@/app/api/register/route";
import { sendInvitationEmail } from "@/lib/password-setup-email";

// Alta con invitación: `sendInvite` manda el link para definir la contraseña por
// el proveedor de email; si el envío falla el usuario igual queda creado.

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BODY = { name: "Juan Perez", email: "juan@example.com", password: "Password1", role: "medic" };

describe("POST /api/register — invitación", () => {
  beforeEach(() => {
    resetAllMocks();
    authMock.mockResolvedValue({ user: { id: "admin-1", email: "admin@test.com", role: "admin" } });
    vi.mocked(getUserRole).mockResolvedValue("admin");
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.role.findUnique.mockResolvedValue({ id: "role-medic" });
    prismaMock.user.create.mockResolvedValue({ id: "u1", name: BODY.name, email: BODY.email, createdAt: new Date() });
  });

  it("sin sendInvite no manda nada e `invite` es null", async () => {
    const res = await POST(req(BODY));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.invite).toBeNull();
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("con sendInvite manda el email al usuario creado y lo informa", async () => {
    vi.mocked(sendInvitationEmail).mockResolvedValue({ ok: true, provider: "console", messageId: "m1" });
    const res = await POST(req({ ...BODY, sendInvite: true }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(sendInvitationEmail).toHaveBeenCalledWith({ email: BODY.email, name: BODY.name });
    expect(json.invite).toEqual({ sent: true, provider: "console" });
  });

  it("si el envío falla, el usuario queda creado e `invite.sent` es false con el motivo", async () => {
    vi.mocked(sendInvitationEmail).mockResolvedValue({ ok: false, provider: "console", error: "Sin proveedor" });
    const res = await POST(req({ ...BODY, sendInvite: true }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.user.id).toBe("u1");
    expect(json.invite).toEqual({ sent: false, provider: "console", error: "Sin proveedor" });
  });

  it("la contraseña sigue la regla única (lib/password-policy)", async () => {
    const res = await POST(req({ ...BODY, password: "sinmayuscula1" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/mayúscula/);
  });
});
