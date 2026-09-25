import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { revokeOtherSessions, revokeUserSessions } from "@/lib/sessions";

vi.mock("@/lib/sessions", () => ({
  revokeUserSessions: vi.fn().mockResolvedValue(1),
  revokeOtherSessions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("@/lib/credentials", () => ({
  setUserPassword: vi.fn().mockResolvedValue(undefined),
  verifyUserPassword: vi.fn().mockResolvedValue(true),
}));

import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as resetPasswordByToken } from "@/app/api/auth/reset-password/route";
import { POST as adminResetPassword } from "@/app/api/users/[id]/reset-password/route";
import { PUT as updateUser, DELETE as deleteUser } from "@/app/api/users/[id]/route";

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", cookie: "session=abc" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const targetCtx = { params: Promise.resolve({ id: "target-1" }) };

beforeEach(() => {
  resetAllMocks();
});

describe("revocación de sesiones", () => {
  it("cambio de contraseña propio → revoca las OTRAS sesiones", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
    const req = json("http://x/api/auth/change-password", "POST", {
      currentPassword: "Viejo123",
      newPassword: "Nuevo1234",
    });

    const res = await changePassword(req);

    expect(res.status).toBe(200);
    expect(revokeOtherSessions).toHaveBeenCalledWith(req.headers);
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it("reset por token → revoca TODAS las sesiones del usuario", async () => {
    prismaMock.resetToken.findFirst.mockResolvedValue({ id: "rt-1", email: "t@x.com" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "target-1" });

    const res = await resetPasswordByToken(
      json("http://x/api/auth/reset-password", "POST", { token: "t", password: "Nuevo1234" })
    );

    expect(res.status).toBe(200);
    expect(revokeUserSessions).toHaveBeenCalledWith("target-1");
  });

  it("reset con token inválido → 400 y no revoca nada", async () => {
    const res = await resetPasswordByToken(
      json("http://x/api/auth/reset-password", "POST", { token: "t", password: "Nuevo1234" })
    );
    expect(res.status).toBe(400);
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it("reset por admin → revoca TODAS las sesiones del usuario afectado", async () => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    prismaMock.user.findUnique.mockResolvedValue({ id: "target-1" });

    const res = await adminResetPassword(
      json("http://x/api/users/target-1/reset-password", "POST", { newPassword: "Nuevo1234" }),
      targetCtx
    );

    expect(res.status).toBe(200);
    expect(revokeUserSessions).toHaveBeenCalledWith("target-1");
  });

  it("deshabilitar usuario (isActive=false) → revoca sus sesiones", async () => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    prismaMock.user.findUnique.mockResolvedValue({ id: "target-1", roles: [{ role: { name: "medic" } }] });

    const res = await updateUser(json("http://x/api/users/target-1", "PUT", { isActive: false }), targetCtx);

    expect(res.status).toBe(200);
    expect(revokeUserSessions).toHaveBeenCalledWith("target-1");
  });

  it("habilitar usuario o editar otros campos → NO revoca", async () => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    prismaMock.user.findUnique.mockResolvedValue({ id: "target-1", roles: [{ role: { name: "medic" } }] });

    await updateUser(json("http://x/api/users/target-1", "PUT", { isActive: true }), targetCtx);
    await updateUser(json("http://x/api/users/target-1", "PUT", { name: "Nuevo Nombre" }), targetCtx);

    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it("baja lógica → revoca sus sesiones", async () => {
    vi.mocked(getUserRole).mockImplementation(async (id: string) =>
      id === "user-1" ? "admin" : "medic"
    );
    prismaMock.user.findUnique.mockResolvedValue({ id: "target-1" });

    const res = await deleteUser(json("http://x/api/users/target-1", "DELETE"), targetCtx);

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } })
    );
    expect(revokeUserSessions).toHaveBeenCalledWith("target-1");
  });

  it("sin sesión → 401 y no revoca nada", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await deleteUser(json("http://x/api/users/target-1", "DELETE"), targetCtx);
    expect(res.status).toBe(401);
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });
});
