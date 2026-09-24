import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import { logAudit } from "@/lib/audit";

const withHeaders = (h: Record<string, string>) => ({ headers: new Headers(h) });

async function lastCreateData() {
  await vi.waitFor(() => expect(prismaMock.auditLog.create).toHaveBeenCalled());
  return prismaMock.auditLog.create.mock.calls.at(-1)![0].data;
}

describe("logAudit: robustez", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("toma solo el primer valor de x-forwarded-for (cliente original)", async () => {
    logAudit({
      userId: "u1",
      action: "VIEW_SENSITIVE",
      resource: "evolution",
      resourceId: "e1",
      req: withHeaders({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1, 10.0.0.2" }),
    });
    expect((await lastCreateData()).ipAddress).toBe("203.0.113.7");
  });

  it("usa x-real-ip si no hay x-forwarded-for", async () => {
    logAudit({
      userId: "u1",
      action: "VIEW_SENSITIVE",
      resource: "evolution",
      resourceId: "e1",
      req: withHeaders({ "x-real-ip": "198.51.100.1" }),
    });
    expect((await lastCreateData()).ipAddress).toBe("198.51.100.1");
  });

  it("recorta ipAddress y resourceId a 191 caracteres (VARCHAR)", async () => {
    logAudit({
      userId: null,
      action: "LOGIN_FAILED",
      resource: "auth",
      resourceId: "a".repeat(500) + "@x.com",
      req: withHeaders({ "x-forwarded-for": "9".repeat(1000) }),
    });
    const data = await lastCreateData();
    expect(data.ipAddress).toHaveLength(191);
    expect(data.resourceId).toHaveLength(191);
  });

  it("sin req → ipAddress y userAgent null", async () => {
    logAudit({ userId: "u1", action: "CREATE", resource: "user", resourceId: "x" });
    const data = await lastCreateData();
    expect(data.ipAddress).toBeNull();
    expect(data.userAgent).toBeNull();
  });
});
