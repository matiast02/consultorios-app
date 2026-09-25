// Revocación de sesiones de Better Auth (tabla Session).
//
// Cuándo revocar:
// - Cambio de contraseña por el propio usuario → las demás sesiones.
// - Reset de contraseña (por token o por admin) → todas.
// - Usuario deshabilitado o borrado → todas (y getSession() lo rechaza).

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

/** Elimina todas las sesiones de un usuario. Devuelve cuántas se revocaron. */
export async function revokeUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId } });
  return result.count;
}

/** Revoca todas las sesiones del usuario actual salvo la que hace la petición. */
export async function revokeOtherSessions(headers: Headers): Promise<void> {
  await auth.api.revokeOtherSessions({ headers });
}
