// Login brute-force protection (serverless-safe: shared store via MySQL).
// Tracks failed attempts per email and applies progressive delays + lockout.
// Uses the RateLimit table with a "login:<email>" key.

import { prisma } from "@/lib/prisma";

const CONFIG = {
  maxAttempts: 5, // Lock after 5 failed attempts
  lockoutDurationMs: 300000, // 5 minutes lockout
  progressiveDelayMs: 1000, // Base delay per failed attempt (1s, 2s, 3s...)
  resetAfterMs: 900000, // Reset counter after 15 min of no attempts
};

function keyFor(email: string): string {
  return `login:${email.toLowerCase().trim()}`;
}

export interface LoginCheckResult {
  allowed: boolean;
  remainingAttempts: number;
  lockedUntil?: number;
  delayMs: number;
  message?: string;
}

/**
 * Check if a login attempt is allowed for the given email.
 * Call BEFORE attempting authentication.
 */
export async function checkLoginAllowed(email: string): Promise<LoginCheckResult> {
  const key = keyFor(email);
  const now = Date.now();

  try {
    const entry = await prisma.rateLimit.findUnique({ where: { key } });

    // No previous attempts, or stale (no activity within the reset window).
    if (!entry || now - entry.updatedAt.getTime() > CONFIG.resetAfterMs) {
      return { allowed: true, remainingAttempts: CONFIG.maxAttempts, delayMs: 0 };
    }

    // Currently locked out.
    if (entry.lockedUntil && entry.lockedUntil.getTime() > now) {
      const remainingSec = Math.ceil((entry.lockedUntil.getTime() - now) / 1000);
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: entry.lockedUntil.getTime(),
        delayMs: 0,
        message: `Cuenta bloqueada temporalmente. Intenta en ${remainingSec} segundos.`,
      };
    }

    const delayMs = entry.count * CONFIG.progressiveDelayMs;
    const remaining = CONFIG.maxAttempts - entry.count;

    return {
      allowed: remaining > 0,
      remainingAttempts: Math.max(0, remaining),
      delayMs,
      message:
        remaining <= 0
          ? `Demasiados intentos fallidos. Cuenta bloqueada por ${CONFIG.lockoutDurationMs / 60000} minutos.`
          : undefined,
    };
  } catch {
    // Fail open on store errors — auth still requires the correct password.
    return { allowed: true, remainingAttempts: CONFIG.maxAttempts, delayMs: 0 };
  }
}

/**
 * Record a failed login attempt. Call AFTER authentication fails.
 */
export async function recordFailedLogin(email: string): Promise<void> {
  const key = keyFor(email);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.resetAfterMs);

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });
    const stale =
      !!existing && now.getTime() - existing.updatedAt.getTime() > CONFIG.resetAfterMs;

    const row = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: stale
        ? { count: 1, expiresAt, lockedUntil: null }
        : { count: { increment: 1 }, expiresAt },
    });

    // Lock the account once the threshold is reached.
    if (row.count >= CONFIG.maxAttempts) {
      await prisma.rateLimit.update({
        where: { key },
        data: { lockedUntil: new Date(now.getTime() + CONFIG.lockoutDurationMs) },
      });
    }
  } catch {
    // ignore store errors
  }
}

/**
 * Record a successful login. Resets the counter. Call AFTER success.
 */
export async function recordSuccessfulLogin(email: string): Promise<void> {
  try {
    await prisma.rateLimit.delete({ where: { key: keyFor(email) } });
  } catch {
    // No row to clear — fine.
  }
}

/**
 * Apply progressive delay (makes brute force painfully slow).
 */
export function applyDelay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10000))); // Cap at 10s
}
