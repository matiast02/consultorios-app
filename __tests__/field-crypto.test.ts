import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { encryptField, decryptField, isEncryptionConfigured } from "@/lib/field-crypto";

beforeAll(() => {
  process.env.HC_ENC_KEY = crypto.randomBytes(32).toString("base64");
  delete process.env.HC_ENC_KEY_2;
  delete process.env.HC_ENC_ACTIVE_KEY;
});

describe("field-crypto", () => {
  it("cifra y descifra (round-trip)", () => {
    const plain = "Diagnóstico: hipertensión — control mensual";
    const enc = encryptField(plain);
    expect(enc).not.toBeNull();
    expect(enc).not.toBe(plain);
    expect(enc!.startsWith("enc:")).toBe(true);
    expect(decryptField(enc)).toBe(plain);
  });

  it("cada cifrado usa IV distinto (no determinístico)", () => {
    const a = encryptField("mismo texto");
    const b = encryptField("mismo texto");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("mismo texto");
    expect(decryptField(b)).toBe("mismo texto");
  });

  it("null → null", () => {
    expect(encryptField(null)).toBeNull();
    expect(decryptField(null)).toBeNull();
  });

  it("texto plano legado (sin prefijo) se devuelve tal cual", () => {
    expect(decryptField("texto viejo sin cifrar")).toBe("texto viejo sin cifrar");
  });

  it("detecta manipulación del ciphertext (GCM)", () => {
    const enc = encryptField("secreto")!;
    const parts = enc.split(":");
    // corromper el último byte del ciphertext
    const tampered = parts.slice(0, 4).join(":") + ":" + Buffer.from("xxxx").toString("base64");
    expect(() => decryptField(tampered)).toThrow();
  });

  it("isEncryptionConfigured refleja la env", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });
});
