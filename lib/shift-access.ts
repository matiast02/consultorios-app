// Política de acceso a turnos (B11 del roadmap).
//
//   - medic: solo sus propios turnos (ver, crear, editar, borrar). No puede
//     crear ni reasignar turnos a otro profesional.
//   - secretary y admin: todos los turnos de todos los profesionales.
//   - Sin rol conocido: nada (403). Antes `isMedic() === false` dejaba pasar
//     como recepción a cualquier usuario sin rol.
//
// Un turno ajeno para un médico responde 404, igual que uno inexistente: no se
// revela que existe. Llegada e inicio de consulta siguen siendo de recepción
// (isSecretaryOrAdmin en sus rutas).

import { getUserRole } from "@/lib/auth-utils";
import { isAppRole, type AppRole } from "@/lib/roles";

export interface ShiftActor {
  userId: string;
  role: AppRole;
  /** true para secretaria y admin: alcance sobre todos los profesionales. */
  seesAll: boolean;
}

export const SHIFT_FORBIDDEN = {
  success: false,
  error: "Tu usuario no tiene un rol que permita gestionar turnos",
} as const;

export const SHIFT_NOT_FOUND = { success: false, error: "Turno no encontrado" } as const;

export const SHIFT_OWN_ONLY = {
  success: false,
  error: "Un profesional solo puede gestionar sus propios turnos",
} as const;

/** Actor de turnos a partir de la sesión, o null si el usuario no tiene rol conocido. */
export async function getShiftActor(userId: string): Promise<ShiftActor | null> {
  const role = await getUserRole(userId);
  if (!isAppRole(role)) return null;
  return { userId, role, seesAll: role !== "medic" };
}

/** ¿El actor puede ver / editar / borrar este turno? */
export function canSeeShift(actor: ShiftActor, shift: { userId: string }): boolean {
  return actor.seesAll || shift.userId === actor.userId;
}

/** ¿El actor puede crear o reasignar un turno para el profesional `targetUserId`? */
export function canAssignTo(actor: ShiftActor, targetUserId: string): boolean {
  return actor.seesAll || targetUserId === actor.userId;
}

/** Filtro Prisma que acota al médico a sus turnos; vacío para recepción y admin. */
export function shiftScope(actor: ShiftActor): { userId?: string } {
  return actor.seesAll ? {} : { userId: actor.userId };
}
