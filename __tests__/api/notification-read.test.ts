// PUT /api/notifications/[id]/read: una notificación ajena responde 404 (no
// 403), igual que una inexistente: no se revela que existe (B13).
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { PUT } from "@/app/api/notifications/[id]/read/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new NextRequest(`http://x/api/notifications/${id}/read`, { method: "PUT" });

beforeEach(() => resetAllMocks());

describe("PUT /api/notifications/[id]/read", () => {
  it("ajena → 404 con el mismo cuerpo que inexistente", async () => {
    prismaMock.notification.findUnique.mockResolvedValue({ id: "n1", userId: "otro", read: false });
    const foreign = await PUT(req("n1"), ctx("n1"));
    prismaMock.notification.findUnique.mockResolvedValue(null);
    const missing = await PUT(req("n2"), ctx("n2"));
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(prismaMock.notification.update).not.toHaveBeenCalled();
  });

  it("propia → 200 y se marca leída; generated-… → 200 sin tocar la base", async () => {
    prismaMock.notification.findUnique.mockResolvedValue({ id: "n1", userId: "user-1", read: false });
    prismaMock.notification.update.mockResolvedValue({ id: "n1", userId: "user-1", read: true });
    expect((await PUT(req("n1"), ctx("n1"))).status).toBe(200);
    expect(prismaMock.notification.update).toHaveBeenCalledWith({ where: { id: "n1" }, data: { read: true } });

    const generated = await PUT(req("generated-daily-summary"), ctx("generated-daily-summary"));
    expect(await generated.json()).toEqual({ success: true, data: { id: "generated-daily-summary", read: true } });
    expect(prismaMock.notification.findUnique).toHaveBeenCalledTimes(1);
  });
});
