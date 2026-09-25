// Texto introductorio del documento OpenAPI (Markdown). La guía completa para
// la app móvil, incluida la generación del cliente Dart, está en docs/API-MOBILE.md.

/**
 * Versión de la API. Subir el MAJOR ante cambios incompatibles (campo que
 * desaparece o cambia de tipo, ruta que se va); MINOR al agregar rutas o campos.
 */
export const API_VERSION = "1.0.0";

export const INFO_DESCRIPTION = `
API del sistema de gestión de consultorios. Cada consultorio corre su propia
instancia (base URL propia); esta documentación se genera del código en cada
deploy, así que describe exactamente lo que responde ese servidor.

## Convenciones

- **Respuestas propias**: \`{ "success": true, "data": … }\` en éxito y
  \`{ "success": false, "error": "mensaje", "code"?: "CODIGO", "details"?: … }\` en error.
  \`error\` está en español y se puede mostrar tal cual; \`code\` (cuando existe) es estable
  para tomar decisiones en el cliente. Los listados paginados agregan \`pagination\`.
- **Endpoints de Better Auth** (\`/api/auth/sign-in/email\`, \`/api/auth/sign-out\`,
  \`/api/auth/get-session\`): usan el formato de Better Auth, sin envoltorio; sus errores son
  \`{ "message": "…", "code": "…" }\`.
- **Fechas**: ISO 8601 en UTC (\`2026-09-24T14:30:00.000Z\`). Fechas calendario como
  \`YYYY-MM-DD\`. El servidor opera en horario de Argentina (\`America/Argentina/Buenos_Aires\`).
- **IDs**: strings opacos (cuid / uuid).
- **404 uniforme**: en datos clínicos, "no existe" y "no tenés acceso" responden igual.
- **Rate limit**: 100 req / 10 s por IP en general; login 6 / 10 s por IP y bloqueo de
  5 minutos por email tras 5 fallos. Respuesta \`429\`.

## Autenticación

Web: cookie HttpOnly \`better-auth.session_token\` (la setea el login).
Clientes nativos (app): el mismo login devuelve el token en el header \`set-auth-token\`
(y en \`token\` del body). Enviarlo en cada request como \`Authorization: Bearer <token>\`.
El token está firmado: no sirve un dump de la tabla de sesiones.

1. \`POST /api/auth/sign-in/email\` con \`{ "email", "password" }\` → 200 + header \`set-auth-token\`.
2. \`GET /api/auth/get-session\` → \`{ "session", "user": { …, "role" } }\` o \`null\` si venció.
3. \`POST /api/auth/sign-out\` revoca la sesión en el servidor.

Sesiones: 12 h sin actividad, renovación por uso, tope absoluto de 7 días. Si el usuario
se deshabilita, todas sus sesiones se revocan. Cambiar la contraseña revoca las demás sesiones.

## Roles

\`medic\` (profesional), \`secretary\` (recepción), \`admin\`. Cada operación indica quién
puede llamarla (\`x-roles\`). Regla general sobre datos clínicos: la secretaria nunca los ve
(salvo alergias en solo lectura); el médico ve solo sus propios asientos o los que le
concedieron; el admin ve todo, siempre auditado.

## App móvil

Las operaciones marcadas **App móvil: sí** (\`x-mobile: true\`) son las que la app Flutter
consume; \`contracts/openapi.mobile.json\` contiene solo esas. Ver \`docs/API-MOBILE.md\`
para el flujo completo y la generación del cliente Dart.
`.trim();
