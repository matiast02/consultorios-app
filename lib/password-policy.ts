// Regla de contraseña única para toda la app: alta de usuarios, reset por link,
// cambio desde el perfil, reset por admin y los medidores de los formularios.
// Antes había ocho copias con criterios distintos (una exigía símbolo, otras no).
// Sin dependencias: la usan cliente, API y auth.ts.

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  key: "length" | "upper" | "digit" | "symbol";
  /** Texto corto para la lista de requisitos del formulario. */
  label: string;
  /** Mensaje de error de validación (solo reglas obligatorias). */
  message: string;
  /** false: no bloquea, solo suma en el medidor de fuerza. */
  required: boolean;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: "length",
    label: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
    message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    required: true,
    test: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
  },
  {
    key: "upper",
    label: "Una mayúscula",
    message: "Debe contener al menos una mayúscula",
    required: true,
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    key: "digit",
    label: "Un número",
    message: "Debe contener al menos un número",
    required: true,
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    key: "symbol",
    label: "Un símbolo (recomendado)",
    message: "",
    required: false,
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

export const PASSWORD_POLICY_DESCRIPTION = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, al menos una mayúscula y un número.`;
export const PASSWORD_MISMATCH = "Las contraseñas no coinciden";

export interface PasswordCheck {
  key: PasswordRule["key"];
  label: string;
  met: boolean;
  required: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  return PASSWORD_RULES.map((r) => ({ key: r.key, label: r.label, met: r.test(password), required: r.required }));
}

/** Primer requisito obligatorio que falla, o null si la contraseña es válida. */
export function passwordError(password: string): string | null {
  for (const r of PASSWORD_RULES) {
    if (r.required && !r.test(password)) return r.message;
  }
  return null;
}

export function isValidPassword(password: string): boolean {
  return passwordError(password) === null;
}

/** Cantidad de reglas cumplidas (obligatorias y recomendadas): 0..PASSWORD_RULES.length. */
export function passwordStrength(password: string): number {
  return PASSWORD_RULES.filter((r) => r.test(password)).length;
}

/** Validación completa de un formulario con confirmación. */
export function passwordConfirmError(password: string, confirm: string): string | null {
  return passwordError(password) ?? (password !== confirm ? PASSWORD_MISMATCH : null);
}
