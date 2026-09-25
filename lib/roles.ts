// Roles de la aplicación y cómo resolver el rol efectivo de un usuario.
//
// Un usuario debería tener exactamente un rol (UserRole). Si por datos
// heredados tuviera varios, el rol efectivo se elige de forma DETERMINISTA por
// prioridad (admin > secretary > medic): antes se tomaba la primera fila que
// devolviera la base, que podía variar entre consultas y hacer que el mismo
// usuario pasara o no un chequeo de permisos según la suerte.
//
// Este módulo no importa nada del servidor: lo usan auth.ts y lib/auth-utils.ts.

export const APP_ROLES = ["admin", "secretary", "medic"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Orden de resolución cuando hay más de un rol: el más privilegiado gana. */
export const ROLE_PRIORITY: readonly AppRole[] = APP_ROLES;

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

/** Rol efectivo a partir de los nombres de rol del usuario (o null si no tiene ninguno conocido). */
export function pickRole(names: Iterable<string | null | undefined>): AppRole | null {
  const present = new Set<string>();
  for (const n of names) if (n) present.add(n);
  for (const role of ROLE_PRIORITY) if (present.has(role)) return role;
  return null;
}
