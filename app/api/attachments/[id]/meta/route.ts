import { NextRequest } from "next/server";
import { getSession } from "@/auth";
import { logAudit } from "@/lib/audit";
import {
  CLINICAL_FORBIDDEN,
  getClinicalActor,
  grantAuditDetails,
} from "@/lib/clinical-access";
import { attachmentJson } from "@/lib/attachments/http";
import { getAttachmentForRead } from "@/lib/attachments/service";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/attachments/[id]/meta — Metadatos (nombre, tipo, tamaño, autor…).
// Mismas reglas que la descarga; el nombre y la descripción son datos de salud.
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
    if (!found) {
      return attachmentJson({ success: false, error: "Adjunto no encontrado" }, { status: 404 });
    }

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "attachment",
      resourceId: id,
      details: { attachmentId: id, meta: true, ...grantAuditDetails(found.grantId) },
      req,
    });

    return attachmentJson({ success: true, data: found.attachment });
  } catch (error) {
    console.error("GET /api/attachments/[id]/meta error:", error);
    return attachmentJson({ success: false, error: "Error al obtener el adjunto" }, { status: 500 });
  }
}
