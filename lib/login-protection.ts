// Login brute-force protection
// Tracks failed attempts per email and applies progressive delays + lockout

interface LoginAttempt {
  failedCount: number;
  lastAttempt: number;
  lockedUntil: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

// Clean old entries every 5 minutes
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts) {
      // Remove entries with no activity for 1 hour
      if (now - entry.lastAttempt > 3600000) {
        loginAttempts.delete(key);
      }
    }
  }, 300000);
}

const CONFIG = {
  maxAttempts: 5,           // Lock after 5 failed attempts
  lockoutDurationMs: 300000, // 5 minutes lockout
  progressiveDelayMs: 1000,  // Base delay per failed attempt (1s, 2s, 3s...)
  resetAfterMs: 900000,      // Reset counter after 15 min of no attempts
};

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
export function checkLoginAllowed(email: string): LoginCheckResult {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const entry = loginAttempts.get(key);

  // No previous attempts
  if (!entry) {
    return { allowed: true, remainingAttempts: CONFIG.maxAttempts, delayMs: 0 };
  }

  // Reset counter if enough time has passed since last attempt
  if (now - entry.lastAttempt > CONFIG.resetAfterMs) {
    loginAttempts.delete(key);
    return { allowed: true, remainingAttempts: CONFIG.maxAttempts, delayMs: 0 };
  }

  // Check if currently locked out
  if (entry.lockedUntil > now) {
    const remainingSec = Math.ceil((entry.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: entry.lockedUntil,
      delayMs: 0,
      message: `Cuenta bloqueada temporalmente. Intenta en ${remainingSec} segundos.`,
    };
  }

  // Calculate progressive delay
  const delayMs = entry.failedCount * CONFIG.progressiveDelayMs;
  const remaining = CONFIG.maxAttempts - entry.failedCount;

  return {
    allowed: remaining > 0,
    remainingAttempts: Math.max(0, remaining),
    delayMs,
    message: remaining <= 0
      ? `Demasiados intentos fallidos. Cuenta bloqueada por ${CONFIG.lockoutDurationMs / 60000} minutos.`
      : undefined,
  };
}

/**
 * Record a failed login attempt.
 * Call AFTER authentication fails.
 */
export function recordFailedLogin(email: string): void {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  let entry = loginAttempts.get(key);

  if (!entry) {
    entry = { failedCount: 0, lastAttempt: now, lockedUntil: 0 };
    loginAttempts.set(key, entry);
  }

  entry.failedCount++;
  entry.lastAttempt = now;

  // Lock account after max attempts
  if (entry.failedCount >= CONFIG.maxAttempts) {
    entry.lockedUntil = now + CONFIG.lockoutDurationMs;
  }
}

/**
 * Record a successful login. Resets the counter.
 * Call AFTER successful authentication.
 */
export function recordSuccessfulLogin(email: string): void {
  const key = email.toLowerCase().trim();
  loginAttempts.delete(key);
}

/**
 * Apply progressive delay (makes brute force painfully slow).
 */
export function applyDelay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10000))); // Cap at 10s
}
