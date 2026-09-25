import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { getSession } from "@/auth";
import { logAudit } from "@/lib/audit";
import { annulAttachmentSchema } from "@/lib/validations";
import {
  CLINICAL_FORBIDDEN,
  getClinicalActor,
  grantAuditDetails,
} from "@/lib/clinical-access";
import { attachmentJson, downloadHeaders } from "@/lib/attachments/http";
import {
  AttachmentError,
  annulAttachment,
  getAttachmentForRead,
  openDecryptedStream,
} from "@/lib/attachments/service";

type RouteContext = { params: Promise<{ id: string }> };

const NOT_FOUND = { success: false, error: "Adjunto no encontrado" } as const;

// GET /api/attachments/[id][?inline=1] — Descarga: descifra en streaming.
// 404 idéntico para inexistente, sin acceso o anulado (salvo autor/admin).
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return attachmentJson({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const actor = await getClinicalActor(session.user.id);
    if (!actor) return attachmentJson(CLINICAL_FORBIDDEN, { status: 403 });

    const { id } = await context.params;
    const found = await getAttachmentForRead(actor, id);
    if (!found) return attachmentJson(NOT_FOUND, { status: 404 });

    let plain: Readable;
    try {
      plain = await openDecryptedStream(found);
    } catch (e) {
      // Archivo faltante en storage o DEK ilegible (¿HC_ENC_KEY equivocada?).
      console.error(`[attachments] no se pudo abrir el adjunto ${id}:`, e);
      return attachmentJson(
        { success: false, error: "El archivo no está disponible" },
        { status: 500 },
      );
    }
    // El tag GCM se verifica al final: un archivo alterado corta la respuesta.
    plain.on("error", (e) => {
      console.error(`[attachments] error al descifrar el adjunto ${id}:`, e.message);
    });

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "attachment",
      resourceId: id,
      details: { attachmentId: id, ...grantAuditDetails(found.grantId) },
      req,
    });

    const inline = req.nextUrl.searchParams.get("inline") === "1";
    return new Response(Readable.toWeb(plain) as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: downloadHeaders(found.attachment, inline),
    });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return attachmentJson({ success: false, error: error.message }, { status: error.status });
    }
    console.error("GET /api/attachments/[id] error:", error);
    return attachmentJson({ success: false, error: "Error al obtener el adjunto" }, { status: 500 });
  }
}

// DELETE /api/attachments/[id] — Anulación lógica (solo el autor). Body: { reason }.
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return attachmentJson({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const actor = await getClinicalActor(session.user.id);
    if (!actor) return attachmentJson(CLINICAL_FORBIDDEN, { status: 403 });

    const { id } = await context.params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // `reason` (contrato); `annulReason` por compatibilidad con los otros asientos.
    const parsed = annulAttachmentSchema.safeParse({ reason: body?.reason ?? body?.annulReason });
    if (!parsed.success) {
      return attachmentJson(
        { success: false, error: "Indicá el motivo de la anulación", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await annulAttachment(actor, id, parsed.data.reason, req);
    return attachmentJson({ success: true, data });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return attachmentJson(
        { success: false, error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    }
    console.error("DELETE /api/attachments/[id] error:", error);
    return attachmentJson({ success: false, error: "Error al anular el adjunto" }, { status: 500 });
  }
}
