// Cifrado de archivos adjuntos (datos de salud) — AES-256-GCM por archivo.
//
// Esquema "envelope":
//   - DEK: clave aleatoria de 32 bytes por archivo. Cifra el contenido.
//   - La DEK se guarda ENVUELTA con la clave maestra HC_ENC_KEY usando
//     `encryptField` (lib/field-crypto.ts), que ya está versionada por keyId.
//     Rotar HC_ENC_KEY no obliga a re-cifrar los archivos: solo a re-envolver
//     las DEK (mismo mecanismo que los campos de texto).
//   - Formato en disco:  [MAGIC "HCA1" (4 bytes)][IV 12 bytes][ciphertext…][TAG 16 bytes]
//     Todo el archivo queda ilegible sin la DEK; el disco nunca ve el claro.
//
// Streaming: cifra y descifra con `Transform`s de Node, así un PDF de 15 MB no
// se carga entero en memoria. El sha256 del CLARO se calcula al subir y se
// guarda para verificación de integridad (ledger y copia de HC).

import crypto from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { encryptField, decryptField } from "@/lib/field-crypto";

export const FILE_MAGIC = Buffer.from("HCA1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGO = "aes-256-gcm";
/** Bytes que el formato HCA1 agrega al claro (encabezado + tag): cifrado − esto = tamaño del claro. */
export const ENCRYPTED_OVERHEAD_BYTES = FILE_MAGIC.length + IV_BYTES + TAG_BYTES;

export interface EncryptedFileInfo {
  /** DEK envuelta con HC_ENC_KEY (token "enc:…"). Guardar en la base. */
  wrappedDek: string;
  /** sha256 hex del contenido en claro. */
  sha256: string;
  /** Tamaño del claro en bytes. */
  sizeBytes: number;
}

export function generateDek(): Buffer {
  return crypto.randomBytes(32);
}

/** Envuelve la DEK con la clave maestra. Lanza si en producción no hay HC_ENC_KEY. */
export function wrapDek(dek: Buffer): string {
  const wrapped = encryptField(dek.toString("base64"));
  if (!wrapped) throw new Error("No se pudo envolver la clave del archivo");
  return wrapped;
}

export function unwrapDek(wrappedDek: string): Buffer {
  const b64 = decryptField(wrappedDek);
  if (!b64) throw new Error("Clave del archivo inválida");
  const dek = Buffer.from(b64, "base64");
  if (dek.length !== 32) throw new Error("Clave del archivo corrupta");
  return dek;
}

/**
 * Cifra `source` (claro) escribiéndolo en `sink` con el formato HCA1.
 * Devuelve la DEK envuelta, el sha256 del claro y el tamaño.
 */
export async function encryptToStream(
  source: Readable,
  sink: NodeJS.WritableStream,
  dek: Buffer = generateDek(),
): Promise<EncryptedFileInfo> {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, dek, iv);
  const hash = crypto.createHash("sha256");
  let sizeBytes = 0;

  const hasher = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      cb(null, chunk);
    },
  });

  await new Promise<void>((resolve, reject) => {
    sink.write(Buffer.concat([FILE_MAGIC, iv]));
    source
      .on("error", reject)
      .pipe(hasher)
      .on("error", reject)
      .pipe(cipher)
      .on("error", reject)
      .on("data", (chunk: Buffer) => {
        sink.write(chunk);
      })
      .on("end", () => {
        try {
          sink.write(cipher.getAuthTag());
          sink.end();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
  });

  return { wrappedDek: wrapDek(dek), sha256: hash.digest("hex"), sizeBytes };
}

/**
 * Descifra un archivo HCA1 completo (Buffer). Para archivos de hasta unos
 * pocos MB es suficiente; `decryptStream` es la versión en streaming.
 */
export function decryptBuffer(data: Buffer, wrappedDek: string): Buffer {
  if (data.length < FILE_MAGIC.length + IV_BYTES + TAG_BYTES) throw new Error("Archivo cifrado truncado");
  if (!data.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) throw new Error("Formato de archivo desconocido");
  const dek = unwrapDek(wrappedDek);
  const iv = data.subarray(FILE_MAGIC.length, FILE_MAGIC.length + IV_BYTES);
  const tag = data.subarray(data.length - TAG_BYTES);
  const ciphertext = data.subarray(FILE_MAGIC.length + IV_BYTES, data.length - TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Descifra en streaming: devuelve un Transform que recibe el archivo HCA1
 * (encabezado incluido) y emite el claro. Falla al final si el tag no
 * verifica (contenido alterado): el consumidor debe tratar 'error'.
 */
export function decryptStream(wrappedDek: string): Transform {
  const dek = unwrapDek(wrappedDek);
  let header = Buffer.alloc(0);
  let decipher: crypto.DecipherGCM | null = null;
  // Retenemos los últimos 16 bytes porque son el tag, no ciphertext.
  let tail = Buffer.alloc(0);

  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      try {
        let data = chunk;
        if (!decipher) {
          header = Buffer.concat([header, data]);
          const need = FILE_MAGIC.length + IV_BYTES;
          if (header.length < need) return cb();
          if (!header.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) {
            return cb(new Error("Formato de archivo desconocido"));
          }
          const iv = header.subarray(FILE_MAGIC.length, need);
          decipher = crypto.createDecipheriv(ALGO, dek, iv);
          data = header.subarray(need);
        }
        const buf = Buffer.concat([tail, data]);
        if (buf.length <= TAG_BYTES) {
          tail = buf;
          return cb();
        }
        const body = buf.subarray(0, buf.length - TAG_BYTES);
        tail = buf.subarray(buf.length - TAG_BYTES);
        cb(null, decipher.update(body));
      } catch (e) {
        cb(e as Error);
      }
    },
    flush(cb) {
      try {
        if (!decipher) return cb(new Error("Archivo cifrado truncado"));
        if (tail.length !== TAG_BYTES) return cb(new Error("Archivo cifrado truncado"));
        decipher.setAuthTag(tail);
        cb(null, decipher.final());
      } catch (e) {
        cb(e as Error);
      }
    },
  });
}
