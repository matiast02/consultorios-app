// Autenticación: endpoints de Better Auth que usa la app (/api/auth/[...all])
// y las rutas propias de contraseña. Verificado contra el servidor: el login
// devuelve el token firmado en el header `set-auth-token` y en `token`.

import { z } from "zod";
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations";
import { defineRoutes, errors, IsoDateTime, okEmpty, TAGS } from "../registry";

/** Errores en formato Better Auth (sin envoltorio `success`). */
export const BetterAuthErrorSchema = z
  .object({
    message: z.string(),
    code: z.string().optional().openapi({ example: "INVALID_EMAIL_OR_PASSWORD" }),
  })
  .openapi({ ref: "BetterAuthError" });

const authErrors = (codes: Record<number, string>) =>
  Object.fromEntries(Object.entries(codes).map(([s, d]) => [s, { description: d, schema: BetterAuthErrorSchema }]));

export const AuthUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "AuthUser" });

export const SessionUserSchema = AuthUserSchema.extend({
  role: z.enum(["medic", "secretary", "admin"]).nullable().describe("Rol efectivo; define qué puede hacer la app."),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
}).openapi({ ref: "SessionUser" });

export const SessionSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    token: z.string().describe("Token de sesión SIN firma; no sirve como bearer."),
    expiresAt: IsoDateTime.describe("Expiración deslizante (12 h sin uso)."),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
  })
  .openapi({ ref: "Session" });

export const SignInResponseSchema = z
  .object({
    redirect: z.boolean(),
    token: z.string().describe("Mismo token firmado que el header `set-auth-token`."),
    user: AuthUserSchema,
  })
  .openapi({ ref: "SignInResponse" });

export const authRoutes = defineRoutes([
  {
    method: "post",
    path: "/api/auth/sign-in/email",
    operationId: "signIn",
    summary: "Iniciar sesión con email y contraseña",
    description: [
      "Devuelve la sesión como cookie (web) y como token firmado en el header `set-auth-token` (app).",
      "Protecciones: rate limit 6 intentos / 10 s por IP (429), bloqueo de 5 minutos por email tras 5 fallos (429),",
      "retardo progresivo, y cuenta deshabilitada o borrada → 403. Cada intento queda en el audit log.",
    ].join(" "),
    tags: [TAGS.auth],
    auth: { kind: "public" },
    mobile: true,
    request: {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        rememberMe: z.boolean().optional().describe("Solo web (cookie persistente)."),
      }),
    },
    responses: {
      200: { description: "Sesión creada. Header `set-auth-token: <token firmado>`.", schema: SignInResponseSchema },
      ...authErrors({
        400: "Body inválido.",
        401: "Email o contraseña incorrectos (`INVALID_EMAIL_OR_PASSWORD`).",
        403: "Cuenta deshabilitada.",
        429: "Rate limit por IP o bloqueo temporal por intentos fallidos.",
      }),
    },
  },
  {
    method: "get",
    path: "/api/auth/get-session",
    operationId: "getSession",
    summary: "Sesión actual",
    description:
      "Con cookie o bearer. Si no hay sesión válida (vencida, revocada, token inválido) responde **200 con body `null`**, no 401. La app debe tratar `null` como 'volver a loguear'.",
    tags: [TAGS.auth],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: {
        description: "Sesión y usuario (con `role`), o `null`.",
        schema: z.object({ session: SessionSchema, user: SessionUserSchema }).nullable(),
      },
    },
  },
  {
    method: "post",
    path: "/api/auth/sign-out",
    operationId: "signOut",
    summary: "Cerrar sesión",
    description: "Revoca la sesión actual en el servidor (cookie o bearer). Body vacío `{}`.",
    tags: [TAGS.auth],
    auth: { kind: "session" },
    mobile: true,
    request: { body: z.object({}).describe("Vacío.") },
    responses: {
      200: { description: "Sesión revocada.", schema: z.object({ success: z.literal(true) }) },
      ...authErrors({ 400: "Sin sesión que cerrar." }),
    },
  },
  {
    method: "post",
    path: "/api/auth/change-password",
    summary: "Cambiar la contraseña del usuario logueado",
    description:
      "Verifica la contraseña actual, guarda el hash nuevo y revoca las **demás** sesiones del usuario (la actual sigue). Rate limit por usuario (429).",
    tags: [TAGS.auth],
    auth: { kind: "session" },
    mobile: true,
    request: { body: changePasswordSchema },
    responses: {
      200: { description: "Contraseña cambiada.", schema: okEmpty },
      ...errors({ 400: "Datos inválidos o contraseña actual incorrecta." }, 401, 404, 429),
    },
  },
  {
    method: "post",
    path: "/api/auth/forgot-password",
    summary: "Solicitar restablecimiento de contraseña",
    description:
      "Responde **siempre 200** (exista o no el email) para no revelar cuentas. Si existe, envía un email con un link de un solo uso y vencimiento; el token se guarda hasheado. Rate limit por email/IP.",
    tags: [TAGS.auth],
    auth: { kind: "public" },
    request: { body: forgotPasswordSchema },
    responses: {
      200: { description: "Solicitud registrada (respuesta idéntica exista o no el email).", schema: okEmpty },
      ...errors(400, 429),
    },
  },
  {
    method: "post",
    path: "/api/auth/reset-password",
    summary: "Restablecer la contraseña con el token del email",
    description: "Consume el token (un solo uso), guarda la contraseña nueva y revoca todas las sesiones del usuario.",
    tags: [TAGS.auth],
    auth: { kind: "public" },
    request: { body: resetPasswordSchema },
    responses: {
      200: { description: "Contraseña restablecida.", schema: okEmpty },
      ...errors({ 400: "Datos inválidos o token inválido/vencido." }),
    },
  },
]);
