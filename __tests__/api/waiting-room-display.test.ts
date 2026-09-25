import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import * as authUtils from "@/lib/auth-utils";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 }),
}));

import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import {
  displayUrl,
  generateDisplayKey,
  hashDisplayKey,
  readDisplayKey,
  verifyDisplayKey,
} from "@/lib/waiting-room/display-key";
import { buildDisplayFeed, FEED_RECENT } from "@/lib/waiting-room/feed";
import { clinicDateKey } from "@/lib/clinic-time";
import { GET as feed } from "@/app/api/public/waiting-room/feed/route";
import { GET as keyStatus, POST as createKey, DELETE as revokeKey } from "@/app/api/admin/waiting-room-display-key/route";

// Pantalla pública de la sala de espera: clave de dispositivo, feed (solo
// números y consultorios) y administración de la clave.

function moduleOn() {
  prismaMock.moduleConfig.findUnique.mockResolvedValue({ module: "waiting_room", enabled: true });
}

function keyConfigured(hash: string, createdAt = new Date("2026-09-25T10:00:00.000Z")) {
  prismaMock.clinicSettings.findUnique.mockResolvedValue({
    waitingRoomDisplayKeyHash: hash,
    waitingRoomDisplayKeyCreatedAt: createdAt,
  });
}

describe("lib/waiting-room/display-key", () => {
  beforeEach(() => resetAllMocks());

  it("genera claves base64url y guarda solo el sha256", () => {
    const { key, hash } = generateDisplayKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(hash).toBe(hashDisplayKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generateDisplayKey().key).not.toBe(key);
  });

  it("verifica la clave contra el hash configurado (tiempo constante)", async () => {
    const { key, hash } = generateDisplayKey();
    keyConfigured(hash);
    expect(await verifyDisplayKey(key)).toBe(true);
    expect(await verifyDisplayKey(generateDisplayKey().key)).toBe(false);
    expect(await verifyDisplayKey(null)).toBe(false);
  });

  it("sin clave configurada nada verifica", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({ waitingRoomDisplayKeyHash: null });
    expect(await verifyDisplayKey(generateDisplayKey().key)).toBe(false);
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    expect(await verifyDisplayKey(generateDisplayKey().key)).toBe(false);
  });

  it("readDisplayKey exige forma de clave", () => {
    const { key } = generateDisplayKey();
    const mk = (v?: string) => new Request("http://localhost/x", { headers: v === undefined ? {} : { "X-Display-Key": v } });
    expect(readDisplayKey(mk(key))).toBe(key);
    expect(readDisplayKey(mk(` ${key} `))).toBe(key);
    expect(readDisplayKey(mk("corta"))).toBeNull();
    expect(readDisplayKey(mk("x".repeat(40) + "!"))).toBeNull();
    expect(readDisplayKey(mk())).toBeNull();
  });

  describe("displayUrl", () => {
    const original = process.env.NEXTAUTH_URL;
    afterEach(() => {
      process.env.NEXTAUTH_URL = original;
    });
    it("arma el link de la pantalla con la base de la app", () => {
      process.env.NEXTAUTH_URL = "https://consultorio.example/";
      expect(displayUrl("abc")).toBe("https://consultorio.example/sala?k=abc");
    });
  });
});

describe("buildDisplayFeed", () => {
  const now = new Date("2026-09-25T15:00:00.000Z");
  const ticket = (n: number, minutesAgo: number, medicId: string | null = "m1") => {
    const at = new Date(now.getTime() - minutesAgo * 60_000);
    return { id: `t${n}`, number: n, room: `C${n}`, calledAt: at, lastCalledAt: at, callCount: 1, medicId };
  };

  beforeEach(() => resetAllMocks());

  it("current = último llamado, recent = los siguientes, sin los médicos con el módulo deshabilitado", async () => {
    prismaMock.waitingTicket.findMany.mockResolvedValue([
      ticket(9, 1),
      ticket(8, 2, "oculto"),
      ticket(7, 3),
      ticket(6, 4, null), // walk-in sin médico: se muestra
      ticket(5, 5),
      ticket(4, 6),
      ticket(3, 7),
    ]);
    prismaMock.waitingTicket.count.mockResolvedValue(3);
    prismaMock.userModuleAccess.findMany.mockResolvedValue([{ userId: "oculto" }]);

    const f = await buildDisplayFeed(now);
    expect(f.now).toBe(now.toISOString());
    expect(f.current?.number).toBe(9);
    expect(f.recent.map((r) => r.number)).toEqual([7, 6, 5, 4]);
    expect(f.recent).toHaveLength(FEED_RECENT);
    expect(f.waitingCount).toBe(3);
    // Solo estas claves: nada que identifique a una persona.
    expect(Object.keys(f.current!).sort()).toEqual(["callCount", "calledAt", "id", "number", "room"]);
    expect(prismaMock.waitingTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: clinicDateKey(now),
          lastCalledAt: { gte: new Date(now.getTime() - 30 * 60_000) },
          OR: [{ closedAt: null }, { closedReason: "ATTENDED" }],
        }),
        orderBy: { lastCalledAt: "desc" },
      }),
    );
    expect(prismaMock.userModuleAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { module: "waiting_room", enabled: false } }),
    );
  });

  it("sin llamados: current null y lista vacía", async () => {
    const f = await buildDisplayFeed(now);
    expect(f.current).toBeNull();
    expect(f.recent).toEqual([]);
    expect(f.waitingCount).toBe(0);
  });
});

describe("GET /api/public/waiting-room/feed", () => {
  const { key, hash } = generateDisplayKey();
  const req = (k?: string) =>
    new NextRequest("http://localhost/api/public/waiting-room/feed", {
      headers: k === undefined ? {} : { "X-Display-Key": k },
    });

  beforeEach(() => {
    resetAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 });
  });

  it("módulo apagado → 404 aunque la clave sea válida", async () => {
    keyConfigured(hash);
    const res = await feed(req(key));
    expect(res.status).toBe(404);
    expect(prismaMock.waitingTicket.findMany).not.toHaveBeenCalled();
  });

  it("clave ausente o incorrecta → el mismo 404", async () => {
    moduleOn();
    keyConfigured(hash);
    const a = await feed(req());
    const b = await feed(req(generateDisplayKey().key));
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(await a.json()).toEqual(await b.json());
    expect(prismaMock.waitingTicket.findMany).not.toHaveBeenCalled();
  });

  it("clave válida → 200 con el feed y sin caché", async () => {
    moduleOn();
    keyConfigured(hash);
    prismaMock.waitingTicket.findMany.mockResolvedValue([
      { id: "t1", number: 5, room: "C2", calledAt: new Date(), lastCalledAt: new Date(), callCount: 1, medicId: "m1" },
    ]);
    prismaMock.waitingTicket.count.mockResolvedValue(2);
    const res = await feed(req(key));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json.data.current).toEqual(expect.objectContaining({ number: 5, room: "C2" }));
    expect(json.data.waitingCount).toBe(2);
  });

  it("429 con Retry-After si la IP supera el límite", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = await feed(req(key));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(prismaMock.moduleConfig.findUnique).not.toHaveBeenCalled();
  });
});

describe("/api/admin/waiting-room-display-key", () => {
  const post = () => new NextRequest("http://localhost/api/admin/waiting-room-display-key", { method: "POST" });
  const del = () => new NextRequest("http://localhost/api/admin/waiting-room-display-key", { method: "DELETE" });

  beforeEach(() => {
    resetAllMocks();
    vi.mocked(authUtils.getUserRole).mockResolvedValue("admin");
  });

  it("solo admin (secretaria → 403)", async () => {
    vi.mocked(authUtils.getUserRole).mockResolvedValue("secretary");
    expect((await keyStatus()).status).toBe(403);
    expect((await createKey(post())).status).toBe(403);
    expect((await revokeKey(del())).status).toBe(403);
    expect(prismaMock.clinicSettings.upsert).not.toHaveBeenCalled();
  });

  it("POST devuelve la clave una sola vez y guarda solo el hash", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({ waitingRoomDisplayKeyHash: null });
    const res = await createKey(post());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(json.data.url).toContain(`/sala?k=${json.data.key}`);
    const call = prismaMock.clinicSettings.upsert.mock.calls[0][0] as {
      update: { waitingRoomDisplayKeyHash: string };
      create: { waitingRoomDisplayKeyHash: string };
    };
    expect(call.update.waitingRoomDisplayKeyHash).toBe(hashDisplayKey(json.data.key));
    expect(call.create.waitingRoomDisplayKeyHash).toBe(hashDisplayKey(json.data.key));
    expect(JSON.stringify(call)).not.toContain(json.data.key);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "clinic_settings", details: { waitingRoomDisplayKey: "created" } }),
    );
  });

  it("POST con clave previa audita la rotación", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({ waitingRoomDisplayKeyHash: "abc" });
    await createKey(post());
    expect(logAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ details: { waitingRoomDisplayKey: "rotated" } }),
    );
  });

  it("GET informa el estado sin la clave", async () => {
    keyConfigured("abc");
    const res = await keyStatus();
    const json = await res.json();
    expect(json.data).toEqual({ configured: true, createdAt: "2026-09-25T10:00:00.000Z" });
    expect(JSON.stringify(json)).not.toContain("abc");
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    expect((await (await keyStatus()).json()).data).toEqual({ configured: false, createdAt: null });
  });

  it("DELETE borra el hash y audita", async () => {
    const res = await revokeKey(del());
    expect(res.status).toBe(200);
    expect(prismaMock.clinicSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { waitingRoomDisplayKeyHash: null, waitingRoomDisplayKeyCreatedAt: null } }),
    );
    expect(logAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ details: { waitingRoomDisplayKey: "revoked" } }),
    );
  });
});
