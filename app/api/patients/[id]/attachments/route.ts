import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { attachmentsQuerySchema, uploadAttachmentFieldsSchema } from "@/lib/validations";
import {
  CLINICAL_FORBIDDEN,
  getClinicalActor,
  grantAuditDetails,
} from "@/lib/clinical-access";
import { attachmentsMaxBytes } from "@/lib/attachments/storage";
import {
  AttachmentError,
  listAttachments,
  uploadAttachment,
} from "@/lib/attachments/service";

type RouteContext = { params: Promise<{ id: string }> };

/** Margen para campos de texto y boundaries del multipart sobre el máximo del archivo. */
const MULTIPART_OVERHEAD = 64 * 1024;

const NO_STORE = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function errorResponse(e: AttachmentError) {
  return json({ success: false, error: e.message, ...(e.code ? { code: e.code } : {}) }, e.status);
}

// GET /api/patients/[id]/attachments?entityType=&entityId= — Adjuntos visibles para el actor
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return json({ success: false, error: "No autorizado" }, 401);
    }

    // Lista blanca: solo roles clínicos (la secretaria nunca ve adjuntos).
    const actor = await getClinicalActor(session.user.id);
    if (!actor) return json(CLINICAL_FORBIDDEN, 403);

    const { id: patientId } = await context.params;
    const { searchParams } = req.nextUrl;
    const query = attachmentsQuerySchema.safeParse({
      entityType: searchParams.get("entityType"),
      entityId: searchParams.get("entityId"),
    });
    if (!query.success) {
      return json({ success: false, error: "Parámetros inválidos", details: query.error.flatten() }, 400);
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) {
      return json({ success: false, error: "Paciente no encontrado" }, 404);
    }

    // Autor: los suyos; admin: todos; concesión: lo que cubra (ver clinical-access).
    const { items, grantId } = await listAttachments(actor, patientId, query.data);

    // Las miniaturas que muestra el listado no se auditan una por una: acá
    // queda cuántas expuso (ver /api/attachments/[id]/thumbnail).
    const thumbnails = items.filter((a) => a.hasThumbnail).length;
    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "attachment",
      resourceId: patientId,
      details: {
        list: true,
        count: items.length,
        ...(thumbnails > 0 ? { thumbnails } : {}),
        ...grantAuditDetails(grantId),
      },
      req,
    });

    return json({ success: true, data: items });
  } catch (error) {
    if (error instanceof AttachmentError) return errorResponse(error);
    console.error("GET /api/patients/[id]/attachments error:", error);
    return json({ success: false, error: "Error al obtener los adjuntos" }, 500);
  }
}

// POST /api/patients/[id]/attachments — Subir un adjunto (multipart/form-data; solo médicos)
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return json({ success: false, error: "No autorizado" }, 401);
    }

    const actor = await getClinicalActor(session.user.id);
    if (!actor) return json(CLINICAL_FORBIDDEN, 403);
    // El admin custodia la HC pero no escribe asientos.
    if (!actor.isMedic) {
      return json({ success: false, error: "Solo profesionales médicos pueden adjuntar archivos" }, 403);
    }

    const { id: patientId } = await context.params;

    // Corte temprano por Content-Length, antes de leer el cuerpo.
    const max = attachmentsMaxBytes();
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > max + MULTIPART_OVERHEAD) {
      return json({ success: false, error: "El archivo supera el tamaño máximo permitido", code: "TOO_LARGE" }, 413);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ success: false, error: "Se esperaba multipart/form-data con el archivo" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return json({ success: false, error: "Falta el archivo", code: "NO_FILE" }, 400);
    }

    const fields = uploadAttachmentFieldsSchema.safeParse({
      entityType: form.get("entityType"),
      entityId: form.get("entityId"),
      description: form.get("description"),
    });
    if (!fields.success) {
      return json({ success: false, error: "Datos inválidos", details: fields.error.flatten() }, 400);
    }

    // Tamaño (413), tipo real por magic bytes (422), asiento asociado,
    // antivirus, cifrado, fila + ledger + audit: todo en el servicio.
    const data = await uploadAttachment({
      actor,
      patientId,
      entityType: fields.data.entityType,
      entityId: fields.data.entityId ?? null,
      description: fields.data.description ?? null,
      file: file as File,
      req,
    });

    return json({ success: true, data }, 201);
  } catch (error) {
    if (error instanceof AttachmentError) return errorResponse(error);
    console.error("POST /api/patients/[id]/attachments error:", error);
    return json({ success: false, error: "Error al subir el adjunto" }, 500);
  }
}
