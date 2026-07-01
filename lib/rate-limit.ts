// DB-backed rate limiter (serverless-safe: shared across instances via MySQL).
// Fixed-window counter keyed by identifier (e.g. "contact:<ip>", "shift:<userId>").

import { prisma } from "@/lib/prisma";

export interface RateLimitConfig {
  maxRequests: number; // max requests per window
  windowMs: number; // window in milliseconds
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = new Date();
  const key = identifier;

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    // No entry, or the previous window has expired → start a fresh window.
    if (!existing || existing.expiresAt < now) {
      const expiresAt = new Date(now.getTime() + config.windowMs);
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, expiresAt },
        update: { count: 1, expiresAt, lockedUntil: null },
      });
      return {
        allowed: true,
        remaining: Math.max(0, config.maxRequests - 1),
        resetAt: expiresAt.getTime(),
      };
    }

    const updated = await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    return {
      allowed: updated.count <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - updated.count),
      resetAt: existing.expiresAt.getTime(),
    };
  } catch {
    // Fail open: never block legitimate traffic if the store is unavailable.
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now.getTime() + config.windowMs,
    };
  }
}
