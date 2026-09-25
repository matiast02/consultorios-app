// Adjuntos de la HC: /api/patients/{id}/attachments, /api/attachments/{id}/**.
// Módulo de REFERENCIA para el resto del registro: DTO con `.openapi({ ref })`,
// request con los mismos schemas Zod que la ruta, errores estándar, multipart y binarios.

import { z } from "zod";
import { annulAttachmentSchema, attachmentsQuerySchema, uploadAttachmentFieldsSchema } from "@/lib/validations";
import { ALLOWED_MIME } from "@/lib/attachments/storage";
import { defineRoutes, errors, IdParam, IsoDateTime, ok, PatientIdParam, TAGS } from "../registry";

export const AttachmentEntityTypeSchema = z
  .enum(["EVOLUTION", "STUDY_ORDER", "CLINICAL_RECORD"])
  .openapi({ ref: "AttachmentEntityType" });

export const AttachmentSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    entityType: AttachmentEntityTypeSchema,
    entityId: z.string().nullable().describe("ID de la evolución u orden asociada; null si es de la ficha en general."),
    fileName: z.string().describe("Nombre original (dato clínico: va cifrado en la base)."),
    mimeType: z.enum(ALLOWED_MIME).describe("Tipo REAL detectado por magic bytes."),
    sizeBytes: z.number().int(),
    sha256: z.string().length(64).describe("Hash del contenido en claro (integridad, ledger)."),
    description: z.string().nullable(),
    uploadedBy: z.object({ id: z.string(), shortName: z.string() }),
    canAnnul: z.boolean().describe("Solo el autor, mientras no esté anulado."),
    annulledAt: IsoDateTime.nullable(),
    annulReason: z.string().nullable(),
    createdAt: IsoDateTime,
    inlinePreviewable: z.boolean().describe("Imagen o PDF: se puede abrir con `?inline=1`."),
    hasThumbnail: z.boolean().describe("Hay miniatura en `GET /api/attachments/{id}/thumbnail` (solo imágenes)."),
    width: z.number().int().nullable().describe("Ancho de la imagen original; null en PDF."),
    height: z.number().int().nullable(),
  })
  .openapi({ ref: "ClinicalAttachment" });

const attachmentAccess =
  "Sube un médico (queda como autor). Leen el autor, el admin y quien tenga una concesión vigente que cubra la sección; la secretaria nunca. Anulados: solo autor y admin los ven (marcados).";

export const attachmentsRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/patients/{id}/attachments",
    summary: "Listar adjuntos visibles del paciente",
    description: `${attachmentAccess}\n\nMás nuevos primero. Audita \`VIEW_SENSITIVE\` una vez por listado (con \`thumbnails\`: cuántas miniaturas expone).`,
    tags: [TAGS.attachments],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: PatientIdParam, query: attachmentsQuerySchema },
    responses: {
      200: { description: "Adjuntos visibles para el actor.", schema: ok(z.array(AttachmentSchema)) },
      ...errors(400, 401, 403, 404),
    },
  },
  {
    method: "post",
    path: "/api/patients/{id}/attachments",
    summary: "Subir un adjunto (multipart)",
    description: [
      "Solo médicos. Validación: no vacío, ≤ `ATTACHMENTS_MAX_MB` (default 15), tipo real por magic bytes (PDF, JPEG, PNG, WebP).",
      "Si se asocia a una evolución u orden, debe ser del mismo paciente, del mismo autor y no estar anulada.",
      "Se cifra por archivo (DEK envuelta con la clave maestra); las imágenes generan miniatura. Queda asiento en el ledger y audit `CREATE` solo con ids.",
    ].join(" "),
    tags: [TAGS.attachments],
    auth: { kind: "session", roles: ["medic"] },
    mobile: true,
    request: {
      params: PatientIdParam,
      bodyContentType: "multipart/form-data",
      body: uploadAttachmentFieldsSchema.extend({
        file: z.string().openapi({ format: "binary", description: "El archivo (campo `file`)." }),
      }),
    },
    responses: {
      201: { description: "Adjunto creado.", schema: ok(AttachmentSchema) },
      ...errors(
        { 400: "Sin archivo, vacío, campos inválidos o el tamaño cambió durante la subida." },
        401,
        { 403: "No es médico, o el asiento asociado es de otro autor." },
        { 404: "Paciente o asiento asociado inexistente." },
        { 409: "El asiento asociado está anulado." },
        413,
        { 422: "Tipo no permitido (magic bytes) o rechazado por el antivirus." },
        503,
      ),
    },
  },
  {
    method: "get",
    path: "/api/attachments/{id}",
    summary: "Descargar el archivo (descifrado en streaming)",
    description: `${attachmentAccess}\n\n\`Content-Disposition: attachment\` por defecto; con \`?inline=1\` (solo imagen/PDF) responde inline con CSP sandbox. Siempre \`nosniff\` y \`Cache-Control: private, no-store\`. Audita \`VIEW_SENSITIVE\` por descarga. El tipo de contenido es el real del archivo (PDF, JPEG, PNG o WebP).`,
    tags: [TAGS.attachments],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: {
      params: IdParam,
      query: z.object({ inline: z.enum(["1"]).optional().describe("Abrir inline (imagen/PDF).") }),
    },
    responses: {
      200: { description: "Contenido del archivo; `Content-Type` según el archivo.", contentType: "application/octet-stream" },
      ...errors(401, 403, 404, { 500: "Archivo no disponible en el storage o clave ilegible." }),
    },
  },
  {
    method: "delete",
    path: "/api/attachments/{id}",
    summary: "Anular un adjunto (lógico, solo el autor)",
    description:
      "El archivo no se borra: queda marcado como anulado con el motivo (cifrado) y se conserva con la HC. Asiento `annulled` en el ledger y audit `DELETE`.",
    tags: [TAGS.attachments],
    auth: { kind: "session", roles: ["medic"] },
    mobile: true,
    request: { params: IdParam, body: annulAttachmentSchema },
    responses: {
      200: { description: "Adjunto anulado.", schema: ok(AttachmentSchema) },
      ...errors({ 400: "Falta el motivo (3 a 300 caracteres)." }, 401, { 403: "Solo el autor anula (ni admin ni concesiones)." }, 404, { 409: "Ya estaba anulado." }),
    },
  },
  {
    method: "get",
    path: "/api/attachments/{id}/meta",
    summary: "Metadatos del adjunto",
    description: `${attachmentAccess}\n\nAudita \`VIEW_SENSITIVE\` (el nombre y la descripción son datos de salud).`,
    tags: [TAGS.attachments],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Metadatos.", schema: ok(AttachmentSchema) },
      ...errors(401, 403, 404),
    },
  },
  {
    method: "get",
    path: "/api/attachments/{id}/thumbnail",
    summary: "Miniatura WebP (solo imágenes)",
    description:
      "Mismo perímetro que la descarga. Sin auditoría propia (la cubre el listado). 404 también cuando no hay miniatura (PDF, imagen ilegible o archivo faltante): la UI vuelve al ícono.",
    tags: [TAGS.attachments],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "WebP ≤ 384 px, inline, `Content-Length` exacto.", contentType: "image/webp" },
      ...errors(401, 403, 404),
    },
  },
]);
