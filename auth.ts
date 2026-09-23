// Better Auth — configuración del servidor.
//
// - Credenciales email + contraseña con hash bcrypt (ver lib/credentials.ts).
// - Sesiones en base de datos (revocables, con IP y user agent), sin cache en cookie.
// - `customSession` agrega `role` (desde UserRole) al usuario de la sesión.
// - `bearer` permite clientes nativos (app móvil) con `Authorization: Bearer`.
// - Los hooks preservan la protección anti fuerza bruta (lib/login-protection)
//   y los audit logs LOGIN_SUCCESS / LOGIN_FAILED / LOGIN_BLOCKED.
//
// Uso en rutas y Server Components: `const session = await getSession();`

import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { bearer, customSession } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { headers } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPasswordHash } from "@/lib/credentials";
import {
  applyDelay,
  checkLoginAllowed,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "@/lib/login-protection";
import { logAudit } from "@/lib/audit";

const SIGN_IN_PATH = "/sign-in/email";
const DISABLED_MESSAGE = "Tu cuenta esta deshabilitada. Contacta al administrador.";

function emailFromBody(body: unknown): string | null {
  const email = (body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string") return null;
  const normalized = email.toLowerCase().trim();
  return normalized.length > 0 ? normalized : null;
}

async function roleOf(userId: string): Promise<string | null> {
  const userRole = await prisma.userRole.findFirst({
    where: { userId },
    include: { role: true },
  });
  return userRole?.role?.name ?? null;
}

export const auth = betterAuth({
  appName: "Consultorio",
  baseURL:
    process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL,
  secret: process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma as unknown as PrismaClient, { provider: "mysql" }),

  emailAndPassword: {
    enabled: true,
    // El alta de usuarios la hace el admin desde /api/register, no el público.
    disableSignUp: true,
    minPasswordLength: 8,
    password: {
      hash: hashPassword,
      verify: ({ password, hash }) => verifyPasswordHash(password, hash),
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    updateAge: 60 * 60 * 24, // se renueva con uso (expiración deslizante)
    // Sin cache en cookie: cada getSession lee la DB, así los cambios de
    // perfil/rol se reflejan al instante (el costo es una query por request).
    cookieCache: { enabled: false },
  },

  hooks: {
    // Antes del login: lockout por intentos fallidos y bloqueo de cuentas
    // deshabilitadas o borradas. Reutiliza lib/login-protection (tabla RateLimit).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = emailFromBody(ctx.body);
      if (!email) return;

      const check = await checkLoginAllowed(email);
      if (!check.allowed) {
        logAudit({
          userId: null,
          action: "LOGIN_BLOCKED",
          resource: "auth",
          resourceId: email,
          details: { reason: "brute_force_lockout", remainingAttempts: 0 },
          req: ctx.request,
        });
        throw new APIError("TOO_MANY_REQUESTS", {
          message: check.message ?? "Cuenta bloqueada temporalmente",
        });
      }
      await applyDelay(check.delayMs);

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, isActive: true, deletedAt: true },
      });
      if (user && (!user.isActive || user.deletedAt)) {
        logAudit({
          userId: user.id,
          action: "LOGIN_BLOCKED",
          resource: "auth",
          resourceId: email,
          details: { reason: user.deletedAt ? "user_deleted" : "user_disabled" },
          req: ctx.request,
        });
        throw new APIError("FORBIDDEN", { message: DISABLED_MESSAGE });
      }
    }),

    // Después del login: contador de intentos + audit log.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = emailFromBody(ctx.body);
      if (!email) return;

      const newSession = ctx.context.newSession;
      if (newSession) {
        await recordSuccessfulLogin(email);
        logAudit({
          userId: newSession.user.id,
          action: "LOGIN_SUCCESS",
          resource: "auth",
          resourceId: email,
          req: ctx.request,
        });
        return;
      }

      await recordFailedLogin(email);
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      logAudit({
        userId: user?.id ?? null,
        action: "LOGIN_FAILED",
        resource: "auth",
        resourceId: email,
        details: { reason: user ? "wrong_password" : "user_not_found" },
        req: ctx.request,
      });
    }),
  },

  plugins: [
    customSession(async ({ user, session }) => ({
      user: { ...user, role: await roleOf(user.id) },
      session,
    })),
    bearer(),
    nextCookies(), // debe ser el último plugin
  ],
});

// ─── Sesión con la forma que usan rutas y Server Components ──────────────────

export interface AppSessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
}

export interface AppSession {
  user: AppSessionUser;
}

/**
 * Sesión actual (cookie o bearer). Devuelve null si no hay usuario autenticado.
 * Reemplaza al antiguo `auth()` de Auth.js manteniendo la misma forma.
 */
export async function getSession(): Promise<AppSession | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const user = result.user as typeof result.user & { role?: string | null };
  return {
    user: {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      role: user.role ?? null,
    },
  };
}
