import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { getSession } from "@/auth";
import { CLINICAL_FORBIDDEN, getClinicalActor } from "@/lib/clinical-access";
import { attachmentJson, thumbnailHeaders } from "@/lib/attachments/http";
import { ENCRYPTED_OVERHEAD_BYTES } from "@/lib/attachments/file-crypto";
import { getAttachmentStorage } from "@/lib/attachments/storage";
import { AttachmentError, getAttachmentForRead, openDecryptedStream } from "@/lib/attachments/service";

type RouteContext = { params: Promise<{ id: string }> };

const NOT_FOUND = { success: false, error: "Miniatura no disponible" } as const;

// GET /api/attachments/[id]/thumbnail — Miniatura WebP (solo adjuntos de imagen).
//
// Mismo perímetro que la descarga (getAttachmentForRead). 404 idéntico para
// inexistente, sin acceso, anulado (salvo autor/admin), sin miniatura (PDF o
// imagen que no se pudo decodificar) o archivo faltante: la UI vuelve al ícono.
//
// No se audita por miniatura: se muestra dentro del listado, que ya queda
// auditado (VIEW_SENSITIVE { list, count, thumbnails }). Abrir el archivo
// completo o descargarlo sí audita por adjunto. Auditar cada miniatura
// registraría "vio el adjunto X" por el solo hecho de abrir la pestaña.
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return attachmentJson({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const actor = await getClinicalActor(session.user.id);
    if (!actor) return attachmentJson(CLINICAL_FORBIDDEN, { status: 403 });

    const { id } = await context.params;
    const found = await getAttachmentForRead(actor, id);
    if (!found?.thumbnailKey) return attachmentJson(NOT_FOUND, { status: 404 });

    let plain: Readable;
    let size: number | null = null;
    try {
      // Tamaño del claro = cifrado − encabezado HCA1 − tag (exacto).
      size = (await getAttachmentStorage().size(found.thumbnailKey)) - ENCRYPTED_OVERHEAD_BYTES;
      plain = await openDecryptedStream({ storageKey: found.thumbnailKey, wrappedDek: found.wrappedDek });
    } catch (e) {
      console.error(`[attachments] no se pudo abrir la miniatura del adjunto ${id}:`, e);
      return attachmentJson(NOT_FOUND, { status: 404 });
    }
    plain.on("error", (e) => {
      console.error(`[attachments] error al descifrar la miniatura del adjunto ${id}:`, e.message);
    });

    return new Response(Readable.toWeb(plain) as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: thumbnailHeaders(size),
    });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return attachmentJson({ success: false, error: error.message }, { status: error.status });
    }
    console.error("GET /api/attachments/[id]/thumbnail error:", error);
    return attachmentJson({ success: false, error: "Error al obtener la miniatura" }, { status: 500 });
  }
}
