// Clave de dispositivo de la pantalla pública /sala (módulo waiting_room).
//
// El televisor no puede loguearse cada 12 h: el admin genera una clave y guarda
// el link /sala?k=<clave> como marcador. En la base vive solo el SHA-256
// (mismo patrón que lib/reminders/tokens.ts); la clave se muestra una sola vez.
// Lo que protege es poco (números y consultorios, nunca nombres), pero evita
// que cualquiera consuma el feed y permite rotarla si se filtra.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const DISPLAY_KEY_HEADER = "x-display-key";
const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function hashDisplayKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateDisplayKey(): { key: string; hash: string } {
  const key = crypto.randomBytes(24).toString("base64url"); // 32 caracteres
  return { key, hash: hashDisplayKey(key) };
}

/** URL absoluta de la pantalla con la clave (para el marcador del televisor). */
export function displayUrl(key: string): string {
  const base =
    process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/sala?k=${key}`;
}

/** Clave del header `X-Display-Key`, o null si falta o no tiene forma de clave. */
export function readDisplayKey(req: Request): string | null {
  const raw = req.headers.get(DISPLAY_KEY_HEADER)?.trim();
  return raw && KEY_RE.test(raw) ? raw : null;
}

/** ¿La clave coincide con la configurada? Comparación en tiempo constante. */
export async function verifyDisplayKey(key: string | null): Promise<boolean> {
  if (!key) return false;
  const row = await prisma.clinicSettings.findUnique({
    where: { id: "default" },
    select: { waitingRoomDisplayKeyHash: true },
  });
  const stored = row?.waitingRoomDisplayKeyHash;
  if (!stored) return false;
  const a = Buffer.from(hashDisplayKey(key), "hex");
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
