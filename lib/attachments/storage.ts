// Almacenamiento de adjuntos: v1 en disco local (volumen Docker), con una
// interfaz mínima para poder cambiar a S3 compatible sin tocar las rutas.
//
//   ATTACHMENTS_DIR    directorio raíz (default ./storage/attachments)
//   ATTACHMENTS_MAX_MB tamaño máximo por archivo (default 15)
//
// Lo que se escribe acá SIEMPRE está cifrado (ver file-crypto.ts): el
// proveedor de storage no necesita conocer la clave. Las claves de objeto son
// `<patientId>/<attachmentId>.hca` para poder respaldar/purgar por paciente.

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export interface AttachmentStorage {
  /** Escribe el stream (ya cifrado) y devuelve la clave de objeto. */
  put(key: string, encrypted: Readable): Promise<void>;
  /** Stream del objeto cifrado. */
  get(key: string): Promise<Readable>;
  /** Tamaño en disco del objeto cifrado (para Content-Length aproximado). */
  size(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
}

export function attachmentsMaxBytes(): number {
  const mb = Number(process.env.ATTACHMENTS_MAX_MB ?? 15);
  return (Number.isFinite(mb) && mb > 0 ? mb : 15) * 1024 * 1024;
}

export function attachmentsRootDir(): string {
  return path.resolve(process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), "storage", "attachments"));
}

/** Clave de objeto canónica; valida que no salga del directorio raíz. */
export function objectKey(patientId: string, attachmentId: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safe(patientId)}/${safe(attachmentId)}.hca`;
}

class LocalDiskStorage implements AttachmentStorage {
  private resolve(key: string): string {
    const root = attachmentsRootDir();
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Clave de objeto inválida");
    return full;
  }

  async put(key: string, encrypted: Readable): Promise<void> {
    const full = this.resolve(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    const tmp = `${full}.tmp`;
    await pipeline(encrypted, fs.createWriteStream(tmp, { mode: 0o600 }));
    await fs.promises.rename(tmp, full);
  }

  async get(key: string): Promise<Readable> {
    const full = this.resolve(key);
    await fs.promises.access(full, fs.constants.R_OK);
    return fs.createReadStream(full);
  }

  async size(key: string): Promise<number> {
    const st = await fs.promises.stat(this.resolve(key));
    return st.size;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(key), fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}

let storage: AttachmentStorage | null = null;

export function getAttachmentStorage(): AttachmentStorage {
  // Futuro: if (process.env.ATTACHMENTS_S3_BUCKET) return new S3Storage(...)
  storage ??= new LocalDiskStorage();
  return storage;
}

// ─── Validación de contenido ─────────────────────────────────────────────────

export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

/** Detecta el tipo real por magic bytes (no confiamos en la extensión ni en el Content-Type del cliente). */
export function sniffMime(head: Buffer): AllowedMime | null {
  if (head.length >= 5 && head.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.length >= 12 && head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function isInlinePreviewable(mime: string): boolean {
  return mime === "application/pdf" || mime.startsWith("image/");
}

/** Nombre de archivo saneado para Content-Disposition y para guardar. */
export function sanitizeFileName(name: string, fallbackExt: string): string {
  const base = (name || "").split(/[\\/]/).pop() ?? "";
  let clean = base.replace(/[\u0000-\u001f"\\<>:|?*]/g, "").trim().slice(0, 120);
  if (!clean || clean.startsWith(".")) clean = `adjunto${fallbackExt}`;
  return clean;
}

export function extensionFor(mime: AllowedMime): string {
  return { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[mime];
}
