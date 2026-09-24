// Miniaturas de adjuntos de imagen (JPEG / PNG / WebP).
//
// Se generan al subir (y con `pnpm db:backfill-thumbnails` para lo anterior):
// WebP de hasta THUMBNAIL_MAX_PX por lado, con la orientación EXIF aplicada y
// SIN metadatos (sharp los descarta: ni GPS ni datos del equipo).
//
// Privacidad: la miniatura es dato de salud igual que el original. Se cifra
// con la MISMA DEK del archivo (formato HCA1, IV propio) en
// `<patientId>/<id>.thumb.hca` y solo se sirve por la ruta autenticada
// /api/attachments/[id]/thumbnail, con el mismo perímetro que la descarga.
// Los PDF no tienen miniatura (el libvips precompilado no trae soporte PDF y
// el ícono alcanza).

import sharp from "sharp";
import { THUMBNAIL_MIME } from "./storage";

export { THUMBNAIL_MIME };

/** Lado máximo de la miniatura (se muestra a 56 px; 384 cubre pantallas 2x y la vista previa borrosa). */
export const THUMBNAIL_MAX_PX = 384;
export const THUMBNAIL_WEBP_QUALITY = 72;
/** Tope de píxeles a decodificar: una imagen de 100 MP ocupa ~400 MB en memoria (bomba de descompresión). */
export const THUMBNAIL_MAX_INPUT_PIXELS = 80_000_000;
export const THUMBNAILABLE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export interface ThumbnailResult {
  /** WebP en claro: cifrar antes de guardar. */
  data: Buffer;
  width: number;
  height: number;
  /** Dimensiones de la imagen original ya orientada. */
  source: { width: number; height: number };
}

export function isThumbnailable(mime: string): boolean {
  return (THUMBNAILABLE_MIME as readonly string[]).includes(mime);
}

function open(input: Buffer) {
  return sharp(input, { limitInputPixels: THUMBNAIL_MAX_INPUT_PIXELS, sequentialRead: true });
}

/**
 * Genera la miniatura. Lanza si la imagen no se puede decodificar (corrupta,
 * truncada o demasiado grande); quien llama decide si eso es fatal. En la
 * subida no lo es: el adjunto se guarda igual, sin miniatura.
 */
export async function makeThumbnail(input: Buffer): Promise<ThumbnailResult> {
  const meta = await open(input).metadata();
  if (!meta.width || !meta.height) throw new Error("Imagen sin dimensiones");
  // Las orientaciones EXIF 5-8 rotan 90°: el original "orientado" tiene los lados invertidos.
  const swap = (meta.orientation ?? 1) >= 5;
  const source = swap
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };

  const { data, info } = await open(input)
    .rotate() // aplica la orientación EXIF (y descarta el tag junto con el resto de metadatos)
    .resize({ width: THUMBNAIL_MAX_PX, height: THUMBNAIL_MAX_PX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, source };
}
