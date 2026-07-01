import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetAllMocks } from "../setup";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkLoginAllowed } from "@/lib/login-protection";

beforeEach(() => resetAllMocks());

describe("checkRateLimit (DB-backed)", () => {
  it("permite y abre ventana nueva cuando no hay entrada", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue(null);
    const r = await checkRateLimit("contact:1.1.1.1", { maxRequests: 3, windowMs: 1000 });
    expect(r.allowed).toBe(true);
    expect(prismaMock.rateLimit.upsert).toHaveBeenCalledOnce();
  });

  it("bloquea al superar el máximo dentro de la ventana", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue({
      key: "k",
      count: 3,
      expiresAt: new Date(Date.now() + 10000),
      lockedUntil: null,
      updatedAt: new Date(),
    });
    prismaMock.rateLimit.update.mockResolvedValue({ count: 4 });
    const r = await checkRateLimit("k", { maxRequests: 3, windowMs: 1000 });
    expect(r.allowed).toBe(false);
  });

  it("reinicia la ventana cuando la anterior expiró", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue({
      key: "k",
      count: 99,
      expiresAt: new Date(Date.now() - 1000), // expired
      lockedUntil: null,
      updatedAt: new Date(Date.now() - 1000),
    });
    const r = await checkRateLimit("k", { maxRequests: 3, windowMs: 1000 });
    expect(r.allowed).toBe(true);
    expect(prismaMock.rateLimit.upsert).toHaveBeenCalledOnce();
  });

  it("fail-open si el store falla", async () => {
    prismaMock.rateLimit.findUnique.mockRejectedValue(new Error("db down"));
    const r = await checkRateLimit("k", { maxRequests: 1, windowMs: 1000 });
    expect(r.allowed).toBe(true);
  });
});

describe("checkLoginAllowed (DB-backed lockout)", () => {
  it("permite cuando no hay intentos previos", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue(null);
    const r = await checkLoginAllowed("a@a.com");
    expect(r.allowed).toBe(true);
    expect(r.remainingAttempts).toBe(5);
  });

  it("bloquea mientras lockedUntil es futuro", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue({
      key: "login:a@a.com",
      count: 5,
      expiresAt: new Date(Date.now() + 60000),
      lockedUntil: new Date(Date.now() + 60000),
      updatedAt: new Date(),
    });
    const r = await checkLoginAllowed("a@a.com");
    expect(r.allowed).toBe(false);
    expect(r.remainingAttempts).toBe(0);
  });

  it("aplica delay progresivo según intentos", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue({
      key: "login:a@a.com",
      count: 2,
      expiresAt: new Date(Date.now() + 60000),
      lockedUntil: null,
      updatedAt: new Date(),
    });
    const r = await checkLoginAllowed("a@a.com");
    expect(r.allowed).toBe(true);
    expect(r.delayMs).toBe(2000);
  });
});
