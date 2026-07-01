// Cifrado por columna de datos clínicos sensibles (Ley 25.326 — datos sensibles).
// AES-256-GCM con clave desde variable de entorno, versionada para rotación.
//
// Formato del token: "enc:<keyId>:<ivB64>:<tagB64>:<cipherB64>"
// - Valores null → null (no se cifran).
// - Valores sin el prefijo "enc:" se consideran texto plano legado y se devuelven
//   tal cual al descifrar (compatibilidad hacia atrás durante la migración).
//
// Config:
//   HC_ENC_KEY         → clave base64 de 32 bytes (id "1", clave por defecto)
//   HC_ENC_KEY_2, ...  → claves adicionales para rotación (ids "2", "3", ...)
//   HC_ENC_ACTIVE_KEY  → id de la clave activa para cifrar (default: la mayor presente)

import crypto from "node:crypto";

const PREFIX = "enc";
const ALGO = "aes-256-gcm";

let warned = false;

function parseKey(b64: string | undefined, label: string): Buffer | null {
  if (!b64) return null;
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(`${label} debe ser una clave base64 de 32 bytes (AES-256)`);
  }
  return buf;
}

function loadKeys(): { keys: Map<string, Buffer>; activeId: string | null } {
  const keys = new Map<string, Buffer>();
  const k1 = parseKey(process.env.HC_ENC_KEY, "HC_ENC_KEY");
  if (k1) keys.set("1", k1);
  for (let i = 2; i <= 9; i++) {
    const k = parseKey(process.env[`HC_ENC_KEY_${i}`], `HC_ENC_KEY_${i}`);
    if (k) keys.set(String(i), k);
  }
  let activeId = process.env.HC_ENC_ACTIVE_KEY ?? null;
  if (activeId && !keys.has(activeId)) {
    throw new Error(`HC_ENC_ACTIVE_KEY=${activeId} no tiene clave configurada`);
  }
  if (!activeId && keys.size > 0) {
    // La mayor id presente.
    activeId = [...keys.keys()].sort((a, b) => Number(b) - Number(a))[0];
  }
  return { keys, activeId };
}

export function isEncryptionConfigured(): boolean {
  return loadKeys().activeId != null;
}

/** Cifra un valor de texto. null → null. Sin clave configurada → devuelve el texto
 *  sin cifrar (permite desarrollo sin config; en producción HC_ENC_KEY es obligatoria). */
export function encryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  const { keys, activeId } = loadKeys();
  if (!activeId) {
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn("[field-crypto] HC_ENC_KEY no configurada: los datos clínicos se guardan SIN cifrar.");
    }
    return value;
  }
  const key = keys.get(activeId)!;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${activeId}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Descifra un token. null → null. Texto plano legado (sin prefijo) → se devuelve igual. */
export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.startsWith(`${PREFIX}:`)) return value as string;

  const parts = value.split(":");
  // enc : keyId : iv : tag : ct
  if (parts.length !== 5) return value;
  const [, keyId, ivB64, tagB64, ctB64] = parts;

  const { keys } = loadKeys();
  const key = keys.get(keyId);
  if (!key) {
    throw new Error(`No hay clave para descifrar (keyId=${keyId}). Configurá HC_ENC_KEY correspondiente.`);
  }
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return pt.toString("utf8");
}
