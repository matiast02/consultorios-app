// Nombres de personas: «Dr./Dra. Apellido», «Apellido, Nombre», iniciales y
// color de avatar. Sin dependencias, para cliente y API. Antes había cinco
// copias de la heurística Dr./Dra. y ocho de las iniciales, con criterios
// distintos entre sí.

export interface PersonName {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}

/** Honorífico por terminación del nombre de pila (es-AR): "María" → Dra., "Martín" → Dr. */
export function honorific(firstName: string | null | undefined): "Dr." | "Dra." {
  return (firstName ?? "").trim().toLowerCase().endsWith("a") ? "Dra." : "Dr.";
}

/** "Dr. Pérez" / "Dra. Gómez"; sin apellido usa el nombre; sin nada, "Profesional". */
export function medicShortName(u: PersonName | null | undefined): string {
  if (!u) return "Profesional";
  const fn = u.firstName?.trim() ?? "";
  const ln = u.lastName?.trim() ?? "";
  const honor = honorific(fn);
  if (ln) return `${honor} ${ln}`;
  if (fn) return `${honor} ${fn}`;
  return u.name?.trim() || "Profesional";
}

/** Igual que `medicShortName` pero desde un nombre completo ("Martín Gervilla" → "Dr. Gervilla"). */
export function medicShortNameFromFull(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Profesional";
  if (parts.length === 1) return `${honorific(parts[0])} ${parts[0]}`;
  return `${honorific(parts[0])} ${parts[parts.length - 1]}`;
}

/** "Apellido, Nombre"; "Paciente" si no hay datos. */
export function personLabel(p: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!p) return "Paciente";
  const ln = p.lastName?.trim() ?? "";
  const fn = p.firstName?.trim() ?? "";
  if (ln && fn) return `${ln}, ${fn}`;
  return ln || fn || "Paciente";
}

/** "Nombre Apellido". */
export function fullName(p: PersonName | null | undefined): string {
  if (!p) return "";
  const fn = p.firstName?.trim() ?? "";
  const ln = p.lastName?.trim() ?? "";
  return [fn, ln].filter(Boolean).join(" ") || (p.name?.trim() ?? "");
}

/** Iniciales nombre + apellido: "Lucas Rodríguez" → "LR". */
export function initials(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${(firstName?.trim()[0] ?? "").toUpperCase()}${(lastName?.trim()[0] ?? "").toUpperCase()}` || "?";
}

/** Iniciales desde un nombre completo: primera y última palabra ("Martín Gervilla" → "MG"). */
export function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const AVATAR_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
];

/** Clases de color de avatar, estables por semilla (id o nombre). */
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
