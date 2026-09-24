// Servicio de adjuntos de la historia clínica (ClinicalAttachment).
//
// Contrato y política: contracts/api-schemas/attachments.yaml.
//
// Subida (`uploadAttachment`), en este orden:
//   1. Solo médicos (el admin custodia la HC, no escribe; la secretaria nunca).
//   2. Archivo: vacío → 400; > ATTACHMENTS_MAX_MB → 413; tipo real por magic
//      bytes (se ignoran el Content-Type del cliente y la extensión) → 422.
//      El nombre se sanea y su extensión se alinea con el tipo detectado.
//   3. Paciente activo; si se asocia a una evolución u orden, el asiento debe
//      existir, ser de ESE paciente, del mismo autor y no estar anulado.
//   4. Antivirus opcional (CLAMAV_HOST, lib/attachments/clamav.ts): FOUND → 422;
//      configurado pero sin respuesta → 503 (fail closed).
//   5. Cifrado en streaming a storage (DEK por archivo, envuelta con
//      HC_ENC_KEY). El stream se corta si supera el máximo aunque `size` mienta.
//   6. Fila + versión v1 en el ledger en UNA transacción; audit CREATE solo con ids.
//   Si algo falla después de empezar a escribir el archivo, se borra
//   (compensación): nunca queda un archivo sin fila ni una fila sin archivo.
//
// Lectura: mismo perímetro que un asiento (`canReadEntry` con kind
// "attachment"). Los anulados solo los ven el autor y el admin (marcados); para
// el resto no existen (404). La auditoría VIEW_SENSITIVE de las lecturas la
// hacen las rutas (necesitan el request y el tipo de acceso).

import crypto from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  attachmentEntryRef,
  canAccessEntry,
  canReadEntry,
  readScopeForList,
  type ClinicalActor,
} from "@/lib/clinical-access";
import { attachmentSnapshot, recordClinicalVersion } from "@/lib/clinical-ledger";
import type { AttachmentEntityType, ClinicalAttachment } from "@/types";
import { ClamavUnavailableError, clamavConfig, scanWithClamav } from "./clamav";
import { decryptStream, encryptToStream, type EncryptedFileInfo } from "./file-crypto";
import {
  attachmentsMaxBytes,
  extensionFor,
  getAttachmentStorage,
  isInlinePreviewable,
  objectKey,
  sanitizeFileName,
  sniffMime,
  type AllowedMime,
} from "./storage";

// ─── Errores ─────────────────────────────────────────────────────────────────

/** Error de negocio con status HTTP; las rutas lo traducen tal cual. */
export class AttachmentError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AttachmentError";
  }
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Lo mínimo de un `File` (Web) que necesita la subida. */
export interface UploadableFile {
  name?: string;
  size: number;
  slice(start?: number, end?: number): Blob;
  stream(): ReadableStream<Uint8Array>;
}

export interface UploadAttachmentInput {
  actor: ClinicalActor;
  patientId: string;
  entityType: AttachmentEntityType;
  entityId?: string | null;
  description?: string | null;
  file: UploadableFile;
  /** Para IP / user-agent del audit. */
  req?: Pick<Request, "headers"> | null;
}

export interface AttachmentListFilter {
  entityType?: AttachmentEntityType;
  entityId?: string;
}

export interface AttachmentList {
  items: ClinicalAttachment[];
  /** Presente si el listado puede incluir adjuntos ajenos gracias a una concesión (auditar). */
  grantId?: string;
}

/** Adjunto legible por el actor, con lo necesario para descifrarlo. */
export interface AttachmentForRead {
  attachment: ClinicalAttachment;
  storageKey: string;
  wrappedDek: string;
  /** Presente si la lectura es posible gracias a una concesión (auditar). */
  grantId?: string;
}

// ─── Serialización ───────────────────────────────────────────────────────────

const SNIFF_BYTES = 16;

/** Columnas para la API: nunca `storageKey` ni `wrappedDek`. */
const dtoSelect = {
  id: true,
  patientId: true,
  uploadedById: true,
  entityType: true,
  entityId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  description: true,
  annulledAt: true,
  annulReason: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true, firstName: true, lastName: true } },
} satisfies Prisma.ClinicalAttachmentSelect;

type AttachmentRow = Prisma.ClinicalAttachmentGetPayload<{ select: typeof dtoSelect }>;

/** "L. Gómez" / nombre / "Profesional". */
export function uploaderShortName(
  u: { name?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  const first = u?.firstName?.trim() ?? "";
  const last = u?.lastName?.trim() ?? "";
  if (last) return first ? `${first.charAt(0).toUpperCase()}. ${last}` : last;
  if (first) return first;
  return u?.name?.trim() || "Profesional";
}

function toIso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toAttachmentDto(row: AttachmentRow, actor: ClinicalActor): ClinicalAttachment {
  return {
    id: row.id,
    patientId: row.patientId,
    entityType: row.entityType as AttachmentEntityType,
    entityId: row.entityId ?? null,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    description: row.description ?? null,
    uploadedBy: { id: row.uploadedById, shortName: uploaderShortName(row.uploadedBy) },
    // Solo el autor, y solo si sigue vigente (el admin ve, no anula).
    canAnnul: !row.annulledAt && row.uploadedById === actor.userId,
    annulledAt: toIso(row.annulledAt),
    annulReason: row.annulledAt ? row.annulReason ?? null : null,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    inlinePreviewable: isInlinePreviewable(row.mimeType),
  };
}

// ─── Nombre de archivo ───────────────────────────────────────────────────────

const EXTENSIONS: Record<AllowedMime, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg", ".jpe", ".jfif"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

// Controles bidi y caracteres invisibles de formato: permiten disfrazar la
// extensión ("informe‮fdp.exe" se ve como "informeexe.pdf").
const INVISIBLE_FORMAT = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Nombre saneado cuya extensión coincide con el tipo REAL detectado:
 * "estudio.exe" (con contenido PDF) → "estudio.pdf"; "foto" → "foto.jpg".
 */
export function normalizeFileName(raw: string, mime: AllowedMime): string {
  const ext = extensionFor(mime);
  const clean = sanitizeFileName((raw || "").normalize("NFC").replace(INVISIBLE_FORMAT, ""), ext);
  const dot = clean.lastIndexOf(".");
  const current = dot > 0 ? clean.slice(dot).toLowerCase() : "";
  if (EXTENSIONS[mime].includes(current)) return clean;
  const base = (dot > 0 ? clean.slice(0, dot) : clean).trim() || "adjunto";
  return `${base.slice(0, 120 - ext.length)}${ext}`;
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

// ─── Streams ─────────────────────────────────────────────────────────────────

function nodeStreamOf(file: UploadableFile): Readable {
  return Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>);
}

/** Corta el stream (413) si supera `max` bytes, aunque `file.size` diga otra cosa. */
async function* limitBytes(source: AsyncIterable<Uint8Array>, max: number): AsyncGenerator<Buffer> {
  let total = 0;
  for await (const chunk of source) {
    total += chunk.byteLength;
    if (total > max) {
      throw new AttachmentError(413, `El archivo supera el máximo de ${formatMb(max)}`, "TOO_LARGE");
    }
    yield Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
}

/** Cifra el archivo en streaming directo al storage (el disco nunca ve el claro). */
async function encryptToStorage(file: UploadableFile, key: string, max: number): Promise<EncryptedFileInfo> {
  const storage = getAttachmentStorage();
  const source = Readable.from(limitBytes(nodeStreamOf(file), max), { objectMode: false });
  const sink = new PassThrough();
  // Los errores viajan por las promesas; sin este listener, un destroy(err)
  // tardío (cuando `put` ya terminó) tiraría el proceso.
  sink.on("error", () => {});

  const encrypting = encryptToStream(source, sink).catch((e: unknown) => {
    sink.destroy(e as Error); // desbloquea el `put` que espera el fin del stream
    throw e;
  });
  const writing = storage.put(key, sink);
  const [enc, put] = await Promise.allSettled([encrypting, writing]);
  if (enc.status === "rejected") throw enc.reason;
  if (put.status === "rejected") throw put.reason;
  return enc.value;
}

/** Antivirus si CLAMAV_HOST está configurado (lee el archivo una vez más, en streaming). */
async function scanIfConfigured(file: UploadableFile, ctx: { patientId: string; userId: string }) {
  const config = clamavConfig();
  if (!config) return;
  let verdict;
  try {
    verdict = await scanWithClamav(nodeStreamOf(file), config);
  } catch (e) {
    if (e instanceof ClamavUnavailableError) {
      console.error("[attachments] antivirus no disponible:", e.message);
      throw new AttachmentError(
        503,
        "El antivirus no está disponible; intentá de nuevo en unos minutos",
        "AV_UNAVAILABLE",
      );
    }
    throw e;
  }
  if (!verdict.clean) {
    // Sin nombre de archivo: solo la firma y los ids.
    console.warn("[attachments] archivo rechazado por el antivirus", {
      signature: verdict.signature,
      patientId: ctx.patientId,
      userId: ctx.userId,
    });
    throw new AttachmentError(422, "El archivo fue rechazado por el antivirus", "AV_FOUND");
  }
}

// ─── Asiento asociado ────────────────────────────────────────────────────────

/**
 * Valida el asiento al que se asocia el adjunto. Devuelve el entityId a
 * guardar (null para la ficha en general o si no se indicó asiento).
 */
async function resolveEntityLink(
  actor: ClinicalActor,
  patientId: string,
  entityType: AttachmentEntityType,
  entityId: string | null,
): Promise<string | null> {
  if (entityType === "CLINICAL_RECORD" || !entityId) return null;
  const isEvolution = entityType === "EVOLUTION";
  const select = { id: true, userId: true, annulledAt: true } as const;
  const entry = isEvolution
    ? await prisma.evolution.findFirst({ where: { id: entityId, clinicalRecord: { patientId } }, select })
    : await prisma.studyOrder.findFirst({ where: { id: entityId, patientId }, select });
  const label = isEvolution ? "la evolución" : "la orden de estudio";
  if (!entry) {
    throw new AttachmentError(404, `No se encontró ${label} para este paciente`, "ENTITY_NOT_FOUND");
  }
  if (entry.userId !== actor.userId) {
    throw new AttachmentError(403, `Solo el autor de ${label} puede adjuntarle archivos`, "NOT_ENTRY_AUTHOR");
  }
  if (entry.annulledAt) {
    throw new AttachmentError(409, `No se puede adjuntar a ${label}: está anulada`, "ENTITY_ANNULLED");
  }
  return entry.id;
}

// ─── Subida ──────────────────────────────────────────────────────────────────

export async function uploadAttachment(input: UploadAttachmentInput): Promise<ClinicalAttachment> {
  const { actor, patientId, file, entityType } = input;
  if (!actor.isMedic) {
    throw new AttachmentError(403, "Solo profesionales médicos pueden adjuntar archivos", "MEDIC_ONLY");
  }

  // 1. Archivo (antes de tocar la base).
  if (!file || typeof file.size !== "number" || typeof file.stream !== "function") {
    throw new AttachmentError(400, "Falta el archivo", "NO_FILE");
  }
  if (file.size === 0) throw new AttachmentError(400, "El archivo está vacío", "EMPTY_FILE");
  const max = attachmentsMaxBytes();
  if (file.size > max) {
    throw new AttachmentError(413, `El archivo supera el máximo de ${formatMb(max)}`, "TOO_LARGE");
  }
  const head = Buffer.from(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const mimeType = sniffMime(head);
  if (!mimeType) {
    throw new AttachmentError(
      422,
      "Tipo de archivo no permitido: solo PDF, JPEG, PNG o WebP",
      "UNSUPPORTED_TYPE",
    );
  }
  const fileName = normalizeFileName(file.name ?? "", mimeType);
  const description = input.description?.trim() || null;

  // 2. Paciente y asiento asociado.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new AttachmentError(404, "Paciente no encontrado", "PATIENT_NOT_FOUND");
  const entityId = await resolveEntityLink(actor, patientId, entityType, input.entityId ?? null);

  // 3. Antivirus (opcional).
  await scanIfConfigured(file, { patientId, userId: actor.userId });

  // 4-6. Archivo cifrado → fila + ledger. Compensación ante cualquier falla.
  const id = crypto.randomUUID();
  const storageKey = objectKey(patientId, id);
  let committed = false;
  try {
    const info = await encryptToStorage(file, storageKey, max);
    if (info.sizeBytes !== file.size) {
      throw new AttachmentError(400, "El archivo cambió durante la subida", "SIZE_MISMATCH");
    }

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.clinicalAttachment.create({
        data: {
          id,
          patientId,
          uploadedById: actor.userId,
          entityType,
          entityId,
          fileName,
          mimeType,
          sizeBytes: info.sizeBytes,
          sha256: info.sha256,
          storageKey,
          wrappedDek: info.wrappedDek,
          description,
        },
        select: dtoSelect,
      });
      await recordClinicalVersion(tx, {
        entityType: "attachment",
        entityId: id,
        patientId,
        action: "created",
        data: attachmentSnapshot({
          fileName,
          mimeType,
          sizeBytes: info.sizeBytes,
          sha256: info.sha256,
          entityType,
          entityId,
          patientId,
        }),
        authorId: actor.userId,
      });
      return created;
    });
    committed = true;

    logAudit({
      userId: actor.userId,
      action: "CREATE",
      resource: "attachment",
      resourceId: id,
      // Solo ids: el nombre del archivo puede ser dato de salud ("VIH.pdf").
      details: { patientId, entityType, entityId },
      req: input.req ?? null,
    });

    return toAttachmentDto(row, actor);
  } catch (e) {
    if (!committed) await compensate(id, storageKey);
    throw e;
  }
}

/**
 * Borra el archivo de una subida fallida. Si la fila existe igual (commit que
 * respondió con error), se conserva: mejor un adjunto que un archivo perdido.
 */
async function compensate(id: string, storageKey: string): Promise<void> {
  const row = await prisma.clinicalAttachment
    .findUnique({ where: { id }, select: { id: true } })
    .catch(() => null);
  if (row) return;
  await getAttachmentStorage()
    .remove(storageKey)
    .catch((err) => console.error("[attachments] no se pudo compensar la subida", storageKey, err));
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Adjuntos del paciente visibles para el actor (más nuevos primero). Los
 * anulados ajenos no se listan; los propios (y todos, para el admin) sí, marcados.
 * No verifica que el paciente exista: lo hace la ruta.
 */
export async function listAttachments(
  actor: ClinicalActor,
  patientId: string,
  filter: AttachmentListFilter = {},
): Promise<AttachmentList> {
  const scope = await readScopeForList(actor, patientId, "attachment");
  const where: Prisma.ClinicalAttachmentWhereInput = {
    patientId,
    ...scope.where,
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    // AND: el alcance puede traer su propio OR.
    ...(actor.isAdmin ? {} : { AND: [{ OR: [{ annulledAt: null }, { uploadedById: actor.userId }] }] }),
  };
  const rows = await prisma.clinicalAttachment.findMany({
    where,
    select: dtoSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return {
    items: rows.map((r) => toAttachmentDto(r, actor)),
    ...(scope.grantId ? { grantId: scope.grantId } : {}),
  };
}

/**
 * Adjunto legible por el actor o null (inexistente, sin acceso, o anulado y el
 * actor no es autor ni admin: misma respuesta, 404).
 */
export async function getAttachmentForRead(
  actor: ClinicalActor,
  id: string,
): Promise<AttachmentForRead | null> {
  const row = await prisma.clinicalAttachment.findUnique({
    where: { id },
    select: { ...dtoSelect, storageKey: true, wrappedDek: true },
  });
  if (!row) return null;
  // patientId del propio adjunto (dueño), nunca uno del cliente.
  const read = await canReadEntry(actor, attachmentEntryRef(row), row.patientId, "attachment");
  if (!read.ok) return null;
  if (row.annulledAt && !canAccessEntry(actor, { userId: row.uploadedById })) return null;
  const { storageKey, wrappedDek, ...rest } = row;
  return {
    attachment: toAttachmentDto(rest, actor),
    storageKey,
    wrappedDek,
    ...(read.grantId ? { grantId: read.grantId } : {}),
  };
}

/**
 * Stream del contenido en claro. El tag GCM se verifica al final: si el
 * archivo fue alterado, el stream termina con error (la respuesta se corta).
 */
export async function openDecryptedStream(a: { storageKey: string; wrappedDek: string }): Promise<Readable> {
  const encrypted = await getAttachmentStorage().get(a.storageKey);
  let decipher;
  try {
    decipher = decryptStream(a.wrappedDek);
  } catch (e) {
    encrypted.destroy();
    throw e;
  }
  encrypted.on("error", (e) => decipher.destroy(e));
  // Si el consumidor corta (cliente que cancela), cerrar también el archivo.
  decipher.on("close", () => encrypted.destroy());
  return encrypted.pipe(decipher);
}

// ─── Anulación ───────────────────────────────────────────────────────────────

/**
 * Anulación lógica (solo el autor). El archivo se conserva con la HC; queda
 * versión "annulled" en el ledger y audit DELETE (sin el motivo: va cifrado).
 */
export async function annulAttachment(
  actor: ClinicalActor,
  id: string,
  reason: string,
  req?: Pick<Request, "headers"> | null,
): Promise<ClinicalAttachment> {
  const row = await prisma.clinicalAttachment.findUnique({ where: { id }, select: dtoSelect });
  const read = row
    ? await canReadEntry(actor, attachmentEntryRef(row), row.patientId, "attachment")
    : null;
  if (!row || !read?.ok || (row.annulledAt && !canAccessEntry(actor, { userId: row.uploadedById }))) {
    throw new AttachmentError(404, "Adjunto no encontrado", "NOT_FOUND");
  }
  if (row.uploadedById !== actor.userId) {
    throw new AttachmentError(403, "Solo el profesional que subió el archivo puede anularlo", "NOT_AUTHOR");
  }
  if (row.annulledAt) throw new AttachmentError(409, "El adjunto ya está anulado", "ALREADY_ANNULLED");

  const annulledAt = new Date();
  await prisma.$transaction(async (tx) => {
    // Condicional: dos anulaciones concurrentes no generan dos versiones.
    const res = await tx.clinicalAttachment.updateMany({
      where: { id, annulledAt: null },
      data: { annulledAt, annulledById: actor.userId, annulReason: reason },
    });
    if (res.count === 0) {
      throw new AttachmentError(409, "El adjunto ya está anulado", "ALREADY_ANNULLED");
    }
    await recordClinicalVersion(tx, {
      entityType: "attachment",
      entityId: id,
      patientId: row.patientId,
      action: "annulled",
      data: attachmentSnapshot(row),
      authorId: actor.userId,
      reason,
    });
  });

  logAudit({
    userId: actor.userId,
    action: "DELETE",
    resource: "attachment",
    resourceId: id,
    details: { patientId: row.patientId, annulled: true },
    req: req ?? null,
  });

  return toAttachmentDto({ ...row, annulledAt, annulReason: reason }, actor);
}
