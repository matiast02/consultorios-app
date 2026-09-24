// Tokens del link público de confirmación de turno.
// El token viaja en la URL (/turno/<token>); en la base se guarda solo el hash.
// Es de un solo recordatorio, vence con el turno y no da acceso a nada más que
// confirmar / cancelar ese turno (la página muestra datos mínimos, sin contenido clínico).

import crypto from "node:crypto";

export function generateConfirmationToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, hash: hashConfirmationToken(token) };
}

export function hashConfirmationToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** URL pública absoluta del link de confirmación. */
export function confirmationUrl(token: string): string {
  const base =
    process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/turno/${token}`;
}
