// Headers HTTP de las rutas de adjuntos (/api/attachments/…).
//
// next.config.ts deja estas rutas FUERA de la CSP global (Next no permite que
// un route handler pise un header puesto por headers()), así que cada respuesta
// de estas rutas lleva su CSP desde acá:
//   - descarga (attachment): sandbox, sin subrecursos, no embebible.
//   - inline imagen: sandbox, embebible solo desde nuestro origen.
//   - miniatura: como inline imagen (WebP), con Content-Length exacto.
//   - inline PDF: SIN sandbox (Chrome no renderiza PDFs en documentos
//     sandboxed); sin subrecursos salvo el visor (object-src 'self'), embebible
//     solo desde nuestro origen. nosniff + Content-Type real (magic bytes)
//     impiden que se interprete como HTML.
//   - JSON: sin subrecursos, no embebible.
// Siempre `nosniff` y `Cache-Control: private, no-store` (datos de salud).

import { NextResponse } from "next/server";
import { ALLOWED_MIME, isInlinePreviewable, THUMBNAIL_FILE_NAME, THUMBNAIL_MIME } from "./storage";

export const ATTACHMENT_CSP = {
  download: "sandbox; default-src 'none'; frame-ancestors 'none'",
  inlineImage: "sandbox; default-src 'none'; frame-ancestors 'self'",
  inlinePdf: "default-src 'none'; object-src 'self'; frame-ancestors 'self'",
  json: "default-src 'none'; frame-ancestors 'none'",
} as const;

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

/** RFC 5987 / 8187: valor de `filename*` (UTF-8, percent-encoded). */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `Content-Disposition` con `filename` ASCII de respaldo (clientes viejos) y
 * `filename*=UTF-8''…` con el nombre real.
 */
export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const ascii =
    fileName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\;%]/g, "_")
      .trim() || "adjunto";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}

/** Content-Type a declarar: solo los tipos permitidos; cualquier otra cosa, binario opaco. */
export function safeContentType(mimeType: string): string {
  return (ALLOWED_MIME as readonly string[]).includes(mimeType) ? mimeType : "application/octet-stream";
}

/**
 * Headers de la descarga. `inline` solo se respeta para imagen/PDF; si no, se
 * degrada a `attachment`.
 */
export function downloadHeaders(
  a: { mimeType: string; fileName: string; sizeBytes: number },
  wantInline: boolean,
): Headers {
  const contentType = safeContentType(a.mimeType);
  const inline = wantInline && contentType !== "application/octet-stream" && isInlinePreviewable(contentType);
  const csp = !inline
    ? ATTACHMENT_CSP.download
    : contentType === "application/pdf"
      ? ATTACHMENT_CSP.inlinePdf
      : ATTACHMENT_CSP.inlineImage;
  const headers = new Headers({
    ...BASE_HEADERS,
    "Content-Type": contentType,
    "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", a.fileName),
    "Content-Security-Policy": csp,
    "X-Frame-Options": inline ? "SAMEORIGIN" : "DENY",
  });
  // Tamaño del claro: exacto (el cifrado agrega encabezado y tag, pero se
  // descifra en streaming y se envía solo el claro).
  if (Number.isInteger(a.sizeBytes) && a.sizeBytes >= 0) {
    headers.set("Content-Length", String(a.sizeBytes));
  }
  return headers;
}

/** Headers de la miniatura (WebP inline con sandbox; sin cache: dato de salud). */
export function thumbnailHeaders(sizeBytes?: number | null): Headers {
  const headers = new Headers({
    ...BASE_HEADERS,
    "Content-Type": THUMBNAIL_MIME,
    "Content-Disposition": contentDisposition("inline", THUMBNAIL_FILE_NAME),
    "Content-Security-Policy": ATTACHMENT_CSP.inlineImage,
    "X-Frame-Options": "SAMEORIGIN",
  });
  if (sizeBytes != null && Number.isInteger(sizeBytes) && sizeBytes >= 0) {
    headers.set("Content-Length", String(sizeBytes));
  }
  return headers;
}

/** JSON para las rutas /api/attachments/… (CSP propia + no-store). */
export function attachmentJson(body: unknown, init: { status?: number } = {}): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Security-Policy": ATTACHMENT_CSP.json,
      "X-Frame-Options": "DENY",
    },
  });
}
