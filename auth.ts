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
import { pickRole } from "@/lib/roles";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const SIGN_IN_PATH = "/sign-in/email";
const DISABLED_MESSAGE = "Tu cuenta esta deshabilitada. Contacta al administrador.";

function emailFromBody(body: unknown): string | null {
  const email = (body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string") return null;
  const normalized = email.toLowerCase().trim();
  return normalized.length > 0 ? normalized : null;
}

interface UserStatus {
  role: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}

/** Rol + estado del usuario en una sola query (se ejecuta en cada getSession). */
async function statusOf(userId: string): Promise<UserStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      deletedAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  return {
    // Mismo criterio que lib/auth-utils getUserRole: determinista si hay varios.
    role: pickRole(user?.roles.map((r) => r.role?.name) ?? []),
    isActive: user?.isActive ?? false,
    deletedAt: user?.deletedAt ?? null,
  };
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
    minPasswordLength: PASSWORD_MIN_LENGTH,
    password: {
      hash: hashPassword,
      verify: ({ password, hash }) => verifyPasswordHash(password, hash),
    },
  },

  session: {
    // Inactividad máxima 12 h (PCs compartidas en recepción/consultorio) con
    // renovación por uso cada hora. El tope ABSOLUTO (SESSION_MAX_AGE_MS) se
    // aplica en getSession(): pasada esa edad la sesión se revoca aunque esté activa.
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
    // Sin cache en cookie: cada getSession lee la DB, así los cambios de
    // perfil/rol se reflejan al instante (el costo es una query por request).
    cookieCache: { enabled: false },
  },

  // Rate limit persistente (sobrevive reinicios y sirve con varias instancias).
  // Regla general de Better Auth: 100 req/10 s por IP. Para el login subimos el
  // default (3/10 s) a 6/10 s: una recepción con varias PCs detrás del mismo IP
  // no tiene que chocar con el límite; el lockout por email de
  // lib/login-protection sigue aplicando encima contra fuerza bruta.
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "authRateLimit",
    customRules: {
      "/sign-in/email": { window: 10, max: 6 },
    },
  },

  // Endpoints de Better Auth que la app no usa: se deshabilitan para reducir
  // superficie (verify-password permitiría probar contraseñas con una sesión
  // robada sin pasar por el lockout; update-user saltea la validación propia).
  disabledPaths: [
    "/verify-password",
    "/update-user",
    "/update-session",
    "/change-email",
    "/delete-user",
    "/request-password-reset",
    "/reset-password",
    "/change-password",
  ],

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
    customSession(async ({ user, session }) => {
      const status = await statusOf(user.id);
      return {
        user: {
          ...user,
          role: status.role,
          isActive: status.isActive,
          isDeleted: status.deletedAt != null,
        },
        session,
      };
    }),
    // Token firmado: un dump de la tabla Session no alcanza para usar un bearer.
    bearer({ requireSignature: true }),
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

/** Tope absoluto de vida de una sesión, independiente de la actividad. */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sesión actual (cookie o bearer). Devuelve null si no hay usuario autenticado.
 * Reemplaza al antiguo `auth()` de Auth.js manteniendo la misma forma.
 */
export async function getSession(): Promise<AppSession | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const user = result.user as typeof result.user & {
    role?: string | null;
    isActive?: boolean;
    isDeleted?: boolean;
  };

  // Usuario deshabilitado o borrado después de iniciar sesión: la sesión deja
  // de valer y se revocan todas las suyas (fire-and-forget).
  if (user.isActive === false || user.isDeleted) {
    void prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
    return null;
  }

  // Tope absoluto: la expiración deslizante no puede extender una sesión para siempre.
  const createdAt = new Date(result.session.createdAt).getTime();
  if (Number.isFinite(createdAt) && Date.now() - createdAt > SESSION_MAX_AGE_MS) {
    void prisma.session.deleteMany({ where: { id: result.session.id } }).catch(() => {});
    return null;
  }

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
