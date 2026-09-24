// Tokens de recuperación de contraseña.
// En la base se guarda SOLO el hash (sha256): un volcado de la tabla ResetToken
// no permite tomar cuentas. El token en claro viaja una sola vez al usuario.

import crypto from "node:crypto";

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateResetToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashResetToken(token) };
}
