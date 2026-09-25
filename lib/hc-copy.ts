// Copia de la historia clínica para el paciente (Ley 26.529 arts. 14, 15, 16 y 19).
//
// - assembleHcCopy(patientId): arma el contenido CANÓNICO de la copia (JSON
//   estable: solo valores JSON, fechas ISO, claves ordenadas al serializar).
//   La HC es única por establecimiento: incluye los asientos de TODOS los
//   profesionales, en orden cronológico, con autor y fecha; los anulados se
//   conservan con fecha, autor y motivo. Cada asiento lleva el contentHash de
//   su última versión en el ledger clínico (lib/clinical-ledger.ts). Los
//   adjuntos (archivos) se listan con nombre, tipo, tamaño y sha256 del
//   contenido: la copia los identifica de forma verificable (los archivos se
//   entregan aparte).
// - hashHcCopy(copy): sha256 del JSON canónico. No incluye metadatos de la
//   emisión (fecha, emisor, solicitud): dos emisiones con el mismo contenido
//   dan el mismo hash, así una copia entregada se puede verificar regenerándola.
// - renderHcCopyPdf(copy, meta): PDF (jsPDF, server side) → Buffer.

import crypto from "node:crypto";
import jsPDF from "jspdf";
import type { HcCopyRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  HC_COPY_REQUESTER_LABELS,
  type HcCopyRequestItem,
  type HcCopyRequesterTypeValue,
  type HcCopyStatusValue,
} from "@/lib/hc-copy-shared";

// ─── Tipos del contenido canónico ─────────────────────────────────────────────

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type HcCopyEntityType = "evolution" | "prescription" | "study_order" | "meal_plan";

export interface HcCopyPerson {
  id: string;
  name: string;
  licenseNumber: string | null;
}

/** Última versión del asiento en el ledger inmutable (ClinicalEntryVersion). */
export interface HcCopyLedgerRef {
  version: number;
  action: string; // created | corrected | annulled
  contentHash: string;
  recordedAt: string;
}

export interface HcCopyEntry {
  entityType: HcCopyEntityType;
  id: string;
  createdAt: string;
  updatedAt: string;
  author: HcCopyPerson;
  data: { [key: string]: JsonValue };
  annulment: { at: string; reason: string | null; by: HcCopyPerson | null } | null;
  ledger: HcCopyLedgerRef | null;
}

export interface HcCopyPatient {
  id: string;
  firstName: string;
  lastName: string;
  dni: string | null;
  birthDate: string | null;
  sex: string | null;
  email: string | null;
  telephone: string | null;
  address: string | null;
  province: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  healthInsurance: { name: string; code: string | null; affiliateNumber: string | null } | null;
  otherInsurances: { name: string; affiliateNumber: string | null }[];
  consent: { type: string; givenAt: string | null } | null;
  archivedAt: string | null;
}

export interface HcCopyClinicalRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  data: { [key: string]: JsonValue };
  ledger: HcCopyLedgerRef | null;
}

export interface HcCopyAccessGrant {
  id: string;
  grantedTo: HcCopyPerson;
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Adjunto de la HC (ClinicalAttachment): metadatos + sha256 del contenido en claro. */
export interface HcCopyAttachment {
  id: string;
  /** EVOLUTION | STUDY_ORDER | CLINICAL_RECORD */
  entityType: string;
  entityId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  description: string | null;
  createdAt: string;
  author: HcCopyPerson;
  annulment: { at: string; reason: string | null; by: HcCopyPerson | null } | null;
  ledger: HcCopyLedgerRef | null;
}

export interface HcCopy {
  format: "hc-copy/v1";
  patient: HcCopyPatient;
  clinicalRecord: HcCopyClinicalRecord | null;
  entries: HcCopyEntry[];
  accessGrants: HcCopyAccessGrant[];
  /**
   * Solo presente si el paciente tiene adjuntos: así el JSON canónico (y el
   * hash) de las copias sin adjuntos no cambia respecto de las ya entregadas.
   */
  attachments?: HcCopyAttachment[];
}

// ─── Normalización a JSON estable ────────────────────────────────────────────

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? String(d) : date.toISOString();
}

function isoRequired(d: Date | string | null | undefined): string {
  return iso(d) ?? "";
}

/** Convierte cualquier valor de Prisma (Date, Decimal, bigint…) a JSON puro. */
export function toJsonValue(v: unknown): JsonValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return iso(v);
  if (Array.isArray(v)) return v.map(toJsonValue);
  if (typeof v === "object") {
    // Prisma.Decimal y similares: representación decimal exacta como string.
    const maybeDecimal = v as { toFixed?: unknown; toString(): string };
    if (typeof maybeDecimal.toFixed === "function") return maybeDecimal.toString();
    const out: { [key: string]: JsonValue } = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = toJsonValue(val);
    }
    return out;
  }
  return String(v);
}

/** Campos guardados como JSON string: se parsean; si no parsean, queda el texto. */
function parseJsonField(v: unknown): JsonValue {
  if (v == null) return null;
  if (typeof v !== "string") return toJsonValue(v);
  try {
    return toJsonValue(JSON.parse(v));
  } catch {
    return v;
  }
}

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      if (obj[k] !== undefined) out[k] = sortKeysDeep(obj[k]);
    }
    return out;
  }
  return v;
}

/** JSON canónico: claves ordenadas recursivamente, sin espacios. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** sha256 (hex) del contenido canónico de la copia. */
export function hashHcCopy(copy: HcCopy): string {
  return crypto.createHash("sha256").update(canonicalJson(copy), "utf8").digest("hex");
}

// ─── Armado de la copia ──────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: string | null;
}

function personFrom(users: Map<string, UserRow>, id: string): HcCopyPerson {
  const u = users.get(id);
  if (!u) return { id, name: "Usuario no disponible", licenseNumber: null };
  const full = [u.firstName ?? "", u.lastName ?? ""].filter(Boolean).join(" ").trim();
  return { id, name: full || u.name || "Usuario", licenseNumber: u.licenseNumber ?? null };
}

const ENTITY_ORDER: Record<HcCopyEntityType, number> = {
  evolution: 0,
  prescription: 1,
  study_order: 2,
  meal_plan: 3,
};

interface AnnullableRow {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  annulledAt: Date | null;
  annulReason: string | null;
  annulledById: string | null;
}

/**
 * Arma el contenido canónico de la copia completa de la HC del paciente.
 * Devuelve null si el paciente no existe. Incluye pacientes archivados (la HC
 * se conserva y los herederos pueden pedirla).
 */
export async function assembleHcCopy(patientId: string): Promise<HcCopy | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      os: { select: { name: true, code: true } },
      insurances: {
        select: {
          healthInsuranceId: true,
          affiliateNumber: true,
          healthInsurance: { select: { name: true } },
        },
      },
    },
  });
  if (!patient) return null;

  const byDate = [{ createdAt: "asc" as const }, { id: "asc" as const }];
  const [record, evolutions, prescriptions, studyOrders, mealPlans, grants, attachmentRows] = await Promise.all([
    prisma.clinicalRecord.findUnique({ where: { patientId } }),
    prisma.evolution.findMany({ where: { clinicalRecord: { patientId } }, orderBy: byDate }),
    prisma.prescription.findMany({ where: { patientId }, orderBy: byDate }),
    prisma.studyOrder.findMany({ where: { patientId }, orderBy: byDate }),
    prisma.mealPlan.findMany({ where: { patientId }, orderBy: byDate }),
    prisma.clinicalAccessGrant.findMany({
      where: { patientId },
      select: {
        id: true,
        grantedToUserId: true,
        status: true,
        startsAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: byDate,
    }),
    // Nunca storageKey ni wrappedDek: la copia describe el archivo, no lo abre.
    prisma.clinicalAttachment.findMany({
      where: { patientId },
      select: {
        id: true,
        uploadedById: true,
        entityType: true,
        entityId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        description: true,
        annulledAt: true,
        annulledById: true,
        annulReason: true,
        createdAt: true,
      },
      orderBy: byDate,
    }),
  ]);
  const attachments = attachmentRows ?? [];

  // Última versión del ledger por asiento (no se leen `data`/`reason`: no hacen falta).
  const entityIds = [
    ...(record ? [record.id] : []),
    ...evolutions.map((e) => e.id),
    ...prescriptions.map((p) => p.id),
    ...studyOrders.map((s) => s.id),
    ...mealPlans.map((m) => m.id),
    ...attachments.map((a) => a.id),
  ];
  const ledgerRows =
    entityIds.length > 0
      ? await prisma.clinicalEntryVersion.findMany({
          where: { entityId: { in: entityIds } },
          select: {
            entityType: true,
            entityId: true,
            version: true,
            action: true,
            contentHash: true,
            createdAt: true,
          },
        })
      : [];
  const lastVersion = new Map<string, HcCopyLedgerRef>();
  for (const row of ledgerRows) {
    const key = `${row.entityType}:${row.entityId}`;
    const prev = lastVersion.get(key);
    if (!prev || row.version > prev.version) {
      lastVersion.set(key, {
        version: row.version,
        action: row.action,
        contentHash: row.contentHash,
        recordedAt: isoRequired(row.createdAt),
      });
    }
  }
  const ledgerOf = (type: string, id: string) => lastVersion.get(`${type}:${id}`) ?? null;

  // Autores, anuladores y destinatarios de concesiones (incluye usuarios dados de baja).
  const annullable: AnnullableRow[] = [...evolutions, ...prescriptions, ...studyOrders, ...mealPlans];
  const userIds = new Set<string>();
  for (const row of annullable) {
    userIds.add(row.userId);
    if (row.annulledById) userIds.add(row.annulledById);
  }
  for (const g of grants) userIds.add(g.grantedToUserId);
  for (const a of attachments) {
    userIds.add(a.uploadedById);
    if (a.annulledById) userIds.add(a.annulledById);
  }
  const userRows: UserRow[] =
    userIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...userIds].sort() } },
          select: { id: true, name: true, firstName: true, lastName: true, licenseNumber: true },
        })
      : [];
  const users = new Map(userRows.map((u) => [u.id, u]));

  const entry = (
    entityType: HcCopyEntityType,
    row: AnnullableRow,
    data: Record<string, unknown>,
  ): HcCopyEntry => ({
    entityType,
    id: row.id,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
    author: personFrom(users, row.userId),
    data: toJsonValue(data) as { [key: string]: JsonValue },
    annulment: row.annulledAt
      ? {
          at: isoRequired(row.annulledAt),
          reason: row.annulReason ?? null,
          by: row.annulledById ? personFrom(users, row.annulledById) : null,
        }
      : null,
    ledger: ledgerOf(entityType, row.id),
  });

  const entries: HcCopyEntry[] = [
    ...evolutions.map((e) =>
      entry("evolution", e, {
        reason: e.reason,
        physicalExam: e.physicalExam,
        diagnosis: e.diagnosis,
        diagnosisCode: e.diagnosisCode,
        treatment: e.treatment,
        indications: e.indications,
        notes: e.notes,
        shiftId: e.shiftId,
      }),
    ),
    ...prescriptions.map((p) =>
      entry("prescription", p, {
        items: parseJsonField(p.items),
        diagnosis: p.diagnosis,
        notes: p.notes,
        durationDays: p.durationDays,
        shiftId: p.shiftId,
      }),
    ),
    ...studyOrders.map((s) =>
      entry("study_order", s, {
        items: parseJsonField(s.items),
        status: s.status,
        resultNotes: s.resultNotes,
        shiftId: s.shiftId,
      }),
    ),
    ...mealPlans.map((m) =>
      entry("meal_plan", m, {
        title: m.title,
        targetCalories: m.targetCalories,
        proteinPct: m.proteinPct,
        carbsPct: m.carbsPct,
        fatPct: m.fatPct,
        hydration: m.hydration,
        meals: parseJsonField(m.meals),
        avoidFoods: m.avoidFoods,
        supplements: m.supplements,
        notes: m.notes,
        shiftId: m.shiftId,
      }),
    ),
  ].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      ENTITY_ORDER[a.entityType] - ENTITY_ORDER[b.entityType] ||
      a.id.localeCompare(b.id),
  );

  const clinicalRecord: HcCopyClinicalRecord | null = record
    ? {
        id: record.id,
        createdAt: isoRequired(record.createdAt),
        updatedAt: isoRequired(record.updatedAt),
        data: {
          bloodType: record.bloodType ?? null,
          heightCm: toJsonValue(record.heightCm),
          weightKg: toJsonValue(record.weightKg),
          allergies: record.allergies ?? null,
          structuredAllergies: parseJsonField(record.structuredAllergies),
          personalHistory: record.personalHistory ?? null,
          familyHistory: record.familyHistory ?? null,
          currentMedication: record.currentMedication ?? null,
          habitsTobacco: record.habitsTobacco ?? null,
          habitsAlcohol: record.habitsAlcohol ?? null,
          habitsActivity: record.habitsActivity ?? null,
          habitsDiet: record.habitsDiet ?? null,
          notes: record.notes ?? null,
          customFields: parseJsonField(record.customFields),
          odontogram: parseJsonField(record.odontogram),
          genogram: parseJsonField(record.genogram),
        },
        ledger: ledgerOf("clinical_record", record.id),
      }
    : null;

  const otherInsurances = (patient.insurances ?? [])
    .filter((i) => i.healthInsuranceId !== patient.osId)
    .map((i) => ({ name: i.healthInsurance?.name ?? "", affiliateNumber: i.affiliateNumber ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.affiliateNumber ?? "").localeCompare(b.affiliateNumber ?? ""));
  const mainAffiliate =
    patient.osNumber ??
    (patient.insurances ?? []).find((i) => i.healthInsuranceId === patient.osId)?.affiliateNumber ??
    null;

  return {
    format: "hc-copy/v1",
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dni: patient.dni ?? null,
      birthDate: iso(patient.birthDate),
      sex: patient.sex ?? null,
      email: patient.email ?? null,
      telephone: patient.telephone ?? null,
      address: patient.address ?? null,
      province: patient.province ?? null,
      country: patient.country ?? null,
      emergencyContactName: patient.emergencyContactName ?? null,
      emergencyContactPhone: patient.emergencyContactPhone ?? null,
      healthInsurance: patient.os
        ? { name: patient.os.name, code: patient.os.code ?? null, affiliateNumber: mainAffiliate }
        : null,
      otherInsurances,
      consent: patient.consentType
        ? { type: patient.consentType, givenAt: iso(patient.consentGivenAt) }
        : null,
      archivedAt: iso(patient.deletedAt),
    },
    clinicalRecord,
    entries,
    accessGrants: grants.map((g) => ({
      id: g.id,
      grantedTo: personFrom(users, g.grantedToUserId),
      status: g.status,
      startsAt: iso(g.startsAt),
      expiresAt: iso(g.expiresAt),
      createdAt: isoRequired(g.createdAt),
    })),
    ...(attachments.length > 0
      ? {
          attachments: attachments.map((a) => ({
            id: a.id,
            entityType: a.entityType,
            entityId: a.entityId ?? null,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            sha256: a.sha256,
            description: a.description ?? null,
            createdAt: isoRequired(a.createdAt),
            author: personFrom(users, a.uploadedById),
            annulment: a.annulledAt
              ? {
                  at: isoRequired(a.annulledAt),
                  reason: a.annulReason ?? null,
                  by: a.annulledById ? personFrom(users, a.annulledById) : null,
                }
              : null,
            ledger: ledgerOf("attachment", a.id),
          })),
        }
      : {}),
  };
}

// ─── Nombre de archivo ───────────────────────────────────────────────────────

const TZ = "America/Argentina/Buenos_Aires";

/** "HC-<apellido>-<AAAA-MM-DD>.pdf" (ASCII, fecha en hora de Argentina). */
export function hcCopyFileName(lastName: string, issuedAt: Date): string {
  const slug =
    lastName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "paciente";
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(issuedAt);
  return `HC-${slug}-${date}.pdf`;
}

// ─── Render PDF ──────────────────────────────────────────────────────────────

export interface HcCopyRenderMeta {
  requestId: string;
  clinicName: string | null;
  issuedAt: Date;
  issuedBy: { name: string; licenseNumber?: string | null; roleLabel?: string | null };
  requester: { type: HcCopyRequesterTypeValue; name: string; dni: string | null };
  requestedAt: Date;
  /** Reemisión de una copia ya entregada. */
  reissue?: boolean;
}

export const HC_COPY_LEGEND =
  "Documento generado por el sistema; la autenticación la realiza el responsable del establecimiento con su firma.";

const ENTRY_TITLES: Record<HcCopyEntityType, string> = {
  evolution: "EVOLUCIÓN",
  prescription: "RECETA",
  study_order: "ORDEN DE ESTUDIOS",
  meal_plan: "PLAN ALIMENTARIO",
};

const LEDGER_ACTIONS: Record<string, string> = {
  created: "creado",
  corrected: "corregido",
  annulled: "anulado",
};

const SEX_LABELS: Record<string, string> = { M: "Masculino", F: "Femenino", X: "X" };
const CONSENT_LABELS: Record<string, string> = {
  WRITTEN: "Escrito firmado",
  VERBAL_RECORDED: "Verbal registrado",
  DIGITAL_SIGNATURE: "Firma digital",
};
const GRANT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activa",
  REJECTED: "Rechazada",
  REVOKED: "Revocada",
  EXPIRED: "Vencida",
};
const STUDY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};
const STUDY_TYPE_LABELS: Record<string, string> = {
  laboratorio: "Laboratorio",
  imagen: "Imagen",
  interconsulta: "Interconsulta",
  otro: "Otro",
};
const TOOTH_STATUS_LABELS: Record<string, string> = {
  healthy: "presente",
  missing: "ausente",
  implant: "implante",
};
const FACE_STATUS_LABELS: Record<string, string> = {
  healthy: "sano",
  caries: "caries",
  restoration: "restauración",
  crown: "corona",
  endodontics: "endodoncia",
  fracture: "fractura",
};
const RELATION_LABELS: Record<string, string> = {
  married: "unidos/casados",
  separated: "separados",
  close: "muy cercana",
  conflictive: "conflictiva",
  distant: "distante",
};
const SEVERITY_LABELS: Record<string, string> = { alta: "alta", media: "media", baja: "baja" };
const ATTACHMENT_ENTITY_TITLES: Record<string, string> = {
  EVOLUTION: "Evolución",
  STUDY_ORDER: "Orden de estudio",
  CLINICAL_RECORD: "Ficha clínica",
};
const ATTACHMENT_MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "Imagen JPEG",
  "image/png": "Imagen PNG",
  "image/webp": "Imagen WebP",
};

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Fechas "solo día" (nacimiento) se guardan a medianoche UTC: se formatean en UTC. */
function fmtDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Las fuentes estándar de jsPDF solo cubren Latin-1: se normalizan comillas,
 * guiones y viñetas tipográficas, y se reemplaza el resto por "?".
 */
function pdfSafe(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●▪]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/[^\n -~ -ÿ]/g, "?");
}

function asText(v: JsonValue | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function asRecord(v: JsonValue | undefined): Record<string, JsonValue> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function personLine(p: HcCopyPerson): string {
  return p.licenseNumber ? `${p.name} (Mat. ${p.licenseNumber})` : p.name;
}

const PAGE = { width: 210, height: 297, left: 20, right: 190, top: 20, bottom: 268 };
const CONTENT_WIDTH = PAGE.right - PAGE.left;
const NEXT_PAGE_TOP = 26;
const PT_TO_MM = 0.3528;

type Rgb = [number, number, number];
const BLACK: Rgb = [20, 20, 20];
const GRAY: Rgb = [110, 110, 110];
const RED: Rgb = [185, 28, 28];
const ACCENT: Rgb = [30, 64, 120];

interface TextOpts {
  size?: number;
  bold?: boolean;
  mono?: boolean;
  color?: Rgb;
  indent?: number;
  after?: number;
}

class PdfWriter {
  y = PAGE.top;
  constructor(readonly doc: jsPDF) {}

  private lineHeight(size: number): number {
    return size * PT_TO_MM * 1.3;
  }

  private font(size: number, bold: boolean, mono: boolean, color: Rgb) {
    this.doc.setFont(mono ? "courier" : "helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  ensure(height: number) {
    if (this.y + height > PAGE.bottom) {
      this.doc.addPage();
      this.y = NEXT_PAGE_TOP;
    }
  }

  gap(mm: number) {
    this.y += mm;
  }

  text(value: string, opts: TextOpts = {}) {
    const size = opts.size ?? 9.5;
    const indent = opts.indent ?? 0;
    this.font(size, opts.bold ?? false, opts.mono ?? false, opts.color ?? BLACK);
    const lines: string[] = this.doc.splitTextToSize(pdfSafe(value), CONTENT_WIDTH - indent);
    const lh = this.lineHeight(size);
    for (const line of lines) {
      this.ensure(lh);
      this.doc.text(line, PAGE.left + indent, this.y);
      this.y += lh;
    }
    this.y += opts.after ?? 0;
  }

  /** "Etiqueta: valor" con sangría colgante; valores largos van debajo de la etiqueta. */
  field(label: string, value: string, opts: { indent?: number; color?: Rgb } = {}) {
    const size = 9.5;
    const indent = opts.indent ?? 0;
    const shown = value.trim() === "" ? "—" : value.trim();
    const labelText = pdfSafe(`${label}: `);
    this.font(size, true, false, opts.color ?? BLACK);
    const labelWidth = this.doc.getTextWidth(labelText);
    const multiline = shown.includes("\n") || labelWidth > 55;
    const lh = this.lineHeight(size);

    if (multiline) {
      this.ensure(lh * 2);
      this.doc.text(labelText, PAGE.left + indent, this.y);
      this.y += lh;
      this.text(shown, { indent: indent + 4, color: opts.color });
      return;
    }

    this.font(size, false, false, opts.color ?? BLACK);
    const lines: string[] = this.doc.splitTextToSize(
      pdfSafe(shown),
      CONTENT_WIDTH - indent - labelWidth,
    );
    lines.forEach((line, i) => {
      this.ensure(lh);
      if (i === 0) {
        this.font(size, true, false, opts.color ?? BLACK);
        this.doc.text(labelText, PAGE.left + indent, this.y);
        this.font(size, false, false, opts.color ?? BLACK);
      }
      this.doc.text(line, PAGE.left + indent + labelWidth, this.y);
      this.y += lh;
    });
  }

  section(title: string) {
    this.ensure(16);
    this.y += 4;
    this.doc.setFillColor(...ACCENT);
    this.doc.rect(PAGE.left, this.y - 4, 1.2, 5.5, "F");
    this.font(11.5, true, false, ACCENT);
    this.doc.text(pdfSafe(title), PAGE.left + 3.5, this.y);
    this.y += 2.5;
    this.doc.setDrawColor(210, 210, 210);
    this.doc.setLineWidth(0.2);
    this.doc.line(PAGE.left, this.y, PAGE.right, this.y);
    this.y += 5;
  }

  rule(color: Rgb = [225, 225, 225]) {
    this.ensure(4);
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(0.2);
    this.doc.line(PAGE.left, this.y, PAGE.right, this.y);
    this.y += 4;
  }
}

function renderEntryData(w: PdfWriter, e: HcCopyEntry) {
  const d = e.data;
  const shown: [string, string][] = [];
  const push = (label: string, v: JsonValue | undefined) => {
    const t = asText(v);
    if (t) shown.push([label, t]);
  };

  if (e.entityType === "evolution") {
    push("Motivo de consulta", d.reason);
    push("Examen físico", d.physicalExam);
    const dx = asText(d.diagnosis);
    const code = asText(d.diagnosisCode);
    if (dx || code) shown.push(["Diagnóstico", code ? `${dx || "—"} (CIE-10: ${code})` : dx]);
    push("Tratamiento", d.treatment);
    push("Indicaciones", d.indications);
    push("Notas", d.notes);
  } else if (e.entityType === "prescription") {
    push("Diagnóstico", d.diagnosis);
    if (Array.isArray(d.items)) {
      const lines = d.items.map((item, i) => {
        const it = asRecord(item) ?? {};
        const parts = [
          asText(it.dose) && `Dosis: ${asText(it.dose)}`,
          asText(it.frequency) && `Frecuencia: ${asText(it.frequency)}`,
          asText(it.duration) && `Duración: ${asText(it.duration)}`,
          asText(it.notes) && `Indicaciones: ${asText(it.notes)}`,
        ].filter(Boolean);
        const med = asText(it.medication) || asText(item);
        return `${i + 1}. ${med}${parts.length ? ` - ${parts.join(" · ")}` : ""}`;
      });
      if (lines.length) shown.push(["Medicamentos", lines.join("\n")]);
    } else {
      push("Medicamentos", d.items);
    }
    push("Notas", d.notes);
    push("Vigencia (días)", d.durationDays);
  } else if (e.entityType === "study_order") {
    if (Array.isArray(d.items)) {
      const lines = d.items.map((item, i) => {
        const it = asRecord(item) ?? {};
        const type = STUDY_TYPE_LABELS[asText(it.type)] ?? asText(it.type);
        const urgent = asText(it.urgency) === "urgente" ? " (URGENTE)" : "";
        const notes = asText(it.notes) ? ` - ${asText(it.notes)}` : "";
        const desc = asText(it.description) || asText(item);
        return `${i + 1}. ${type ? `[${type}] ` : ""}${desc}${urgent}${notes}`;
      });
      if (lines.length) shown.push(["Estudios", lines.join("\n")]);
    } else {
      push("Estudios", d.items);
    }
    const status = asText(d.status);
    if (status) shown.push(["Estado del estudio", STUDY_STATUS_LABELS[status] ?? status]);
    push("Resultados", d.resultNotes);
  } else {
    push("Título", d.title);
    const macros = [
      asText(d.targetCalories) && `${asText(d.targetCalories)} kcal/día`,
      asText(d.proteinPct) && `Proteínas ${asText(d.proteinPct)}%`,
      asText(d.carbsPct) && `Carbohidratos ${asText(d.carbsPct)}%`,
      asText(d.fatPct) && `Grasas ${asText(d.fatPct)}%`,
    ].filter(Boolean);
    if (macros.length) shown.push(["Objetivo", macros.join(" · ")]);
    push("Hidratación", d.hydration);
    if (Array.isArray(d.meals)) {
      const lines = d.meals.map((meal) => {
        const m = asRecord(meal) ?? {};
        const time = asText(m.time) ? ` (${asText(m.time)})` : "";
        return `${asText(m.name) || "Comida"}${time}: ${asText(m.options) || "—"}`;
      });
      if (lines.length) shown.push(["Comidas", lines.join("\n")]);
    } else {
      push("Comidas", d.meals);
    }
    push("Alimentos a evitar", d.avoidFoods);
    push("Suplementos", d.supplements);
    push("Notas", d.notes);
  }

  if (shown.length === 0) {
    w.text("(asiento sin contenido)", { color: GRAY, indent: 4 });
    return;
  }
  for (const [label, value] of shown) w.field(label, value, { indent: 4 });
}

function describeStructuredAllergies(v: JsonValue): string {
  if (!Array.isArray(v)) return asText(v);
  return v
    .map((a) => {
      const r = asRecord(a) ?? {};
      const sev = SEVERITY_LABELS[asText(r.severidad)] ?? asText(r.severidad);
      const note = asText(r.nota) ? `: ${asText(r.nota)}` : "";
      return `- ${asText(r.nombre) || asText(a)}${sev ? ` (severidad ${sev})` : ""}${note}`;
    })
    .join("\n");
}

function describeOdontogram(v: JsonValue): string {
  const data = asRecord(v);
  if (!data) return asText(v);
  const teeth = asRecord(data.teeth) ?? {};
  const lines: string[] = [];
  for (const tooth of Object.keys(teeth).sort()) {
    const t = asRecord(teeth[tooth]) ?? {};
    const status = asText(t.status);
    const faces = asRecord(t.faces) ?? {};
    const faceParts = Object.keys(faces)
      .sort()
      .filter((f) => asText(faces[f]) && asText(faces[f]) !== "healthy")
      .map((f) => `${f}: ${FACE_STATUS_LABELS[asText(faces[f])] ?? asText(faces[f])}`);
    const notes = asText(t.notes);
    if ((status && status !== "healthy") || faceParts.length || notes) {
      const parts = [
        status && status !== "healthy" ? TOOTH_STATUS_LABELS[status] ?? status : "",
        faceParts.length ? `caras ${faceParts.join(", ")}` : "",
        notes,
      ].filter(Boolean);
      lines.push(`- Pieza ${tooth}: ${parts.join("; ")}`);
    }
  }
  if (asText(data.notes)) lines.push(`Notas: ${asText(data.notes)}`);
  return lines.length ? lines.join("\n") : "Sin hallazgos registrados (todas las piezas sanas).";
}

function describeGenogram(v: JsonValue): string {
  const data = asRecord(v);
  if (!data) return asText(v);
  const members = Array.isArray(data.members) ? data.members : [];
  const names = new Map<string, string>();
  const lines: string[] = [];
  for (const m of members) {
    const r = asRecord(m) ?? {};
    names.set(asText(r.id), asText(r.name) || "—");
    const bits = [asText(r.relationship), asText(r.age) && `${asText(r.age)} años`].filter(Boolean);
    const extra = [asText(r.conditions), asText(r.notes)].filter(Boolean).join("; ");
    lines.push(`- ${asText(r.name) || "—"}${bits.length ? ` (${bits.join(", ")})` : ""}${extra ? `: ${extra}` : ""}`);
  }
  const relations = Array.isArray(data.relations) ? data.relations : [];
  for (const rel of relations) {
    const r = asRecord(rel) ?? {};
    const type = RELATION_LABELS[asText(r.type)] ?? asText(r.type);
    lines.push(
      `- Vínculo ${names.get(asText(r.from)) ?? asText(r.from)} / ${names.get(asText(r.to)) ?? asText(r.to)}: ${type}`,
    );
  }
  if (asText(data.notes)) lines.push(`Notas: ${asText(data.notes)}`);
  return lines.length ? lines.join("\n") : "Sin datos.";
}

function describeCustomFields(v: JsonValue): string {
  const data = asRecord(v);
  if (!data) return asText(v);
  const lines = Object.keys(data)
    .sort()
    .map((k) => `- ${k}: ${asText(data[k]) || "—"}`);
  return lines.join("\n");
}

function ledgerLine(ref: HcCopyLedgerRef | null): string {
  if (!ref) return "Ledger: sin versiones registradas (asiento anterior al registro inalterable).";
  const action = LEDGER_ACTIONS[ref.action] ?? ref.action;
  return `Ledger v${ref.version} (${action} ${fmtDateTime(ref.recordedAt)}) sha256: ${ref.contentHash}`;
}

/** Genera el PDF de la copia. Sincrónico; devuelve el binario listo para enviar. */
export function renderHcCopyPdf(copy: HcCopy, meta: HcCopyRenderMeta): Buffer {
  const documentHash = hashHcCopy(copy);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = new PdfWriter(doc);
  const p = copy.patient;
  const patientName = `${p.lastName}, ${p.firstName}`;
  const clinicName = meta.clinicName?.trim() || "Establecimiento de salud";

  doc.setProperties({
    title: `Copia de historia clínica - ${patientName}`,
    subject: `Solicitud ${meta.requestId}`,
    creator: "ConsultorioApp",
  });

  // ── Encabezado ──
  w.text(clinicName, { size: 15, bold: true, color: ACCENT, after: 1 });
  w.text("COPIA DE HISTORIA CLÍNICA", { size: 13, bold: true, after: 0.5 });
  w.text(
    "Copia íntegra de la historia clínica única del establecimiento (Ley 26.529, arts. 14 a 19).",
    { size: 8.5, color: GRAY, after: 2 },
  );
  w.rule([180, 180, 180]);

  w.field("Solicitud N°", meta.requestId);
  w.field("Fecha de emisión", `${fmtDateTime(meta.issuedAt)} (hora de Argentina)`);
  const issuer = [
    meta.issuedBy.name,
    meta.issuedBy.licenseNumber ? `Mat. ${meta.issuedBy.licenseNumber}` : null,
    meta.issuedBy.roleLabel ?? null,
  ]
    .filter(Boolean)
    .join(" - ");
  w.field("Emitida por", issuer);
  const requester = [
    meta.requester.name,
    meta.requester.dni ? `DNI ${meta.requester.dni}` : null,
    HC_COPY_REQUESTER_LABELS[meta.requester.type] ?? meta.requester.type,
  ]
    .filter(Boolean)
    .join(" - ");
  w.field("Solicitante", requester);
  w.field("Fecha de solicitud", fmtDateTime(meta.requestedAt));
  if (meta.reissue) {
    w.text("Reemisión de una copia ya entregada (contenido actualizado a la fecha de emisión).", {
      size: 8.5,
      color: GRAY,
    });
  }

  // ── 1. Paciente ──
  w.section("1. Datos del paciente");
  w.field("Apellido y nombre", patientName);
  w.field("DNI", p.dni ?? "");
  w.field("Fecha de nacimiento", p.birthDate ? fmtDateOnly(p.birthDate) : "");
  w.field("Sexo", p.sex ? SEX_LABELS[p.sex] ?? p.sex : "");
  w.field("Email", p.email ?? "");
  w.field("Teléfono", p.telephone ?? "");
  w.field("Domicilio", [p.address, p.province, p.country].filter(Boolean).join(", "));
  w.field(
    "Obra social",
    p.healthInsurance
      ? `${p.healthInsurance.name}${p.healthInsurance.affiliateNumber ? ` - Afiliado N° ${p.healthInsurance.affiliateNumber}` : ""}`
      : "Sin obra social",
  );
  if (p.otherInsurances.length) {
    w.field(
      "Otras coberturas",
      p.otherInsurances
        .map((i) => `${i.name}${i.affiliateNumber ? ` - Afiliado N° ${i.affiliateNumber}` : ""}`)
        .join("\n"),
    );
  }
  w.field(
    "Contacto de emergencia",
    [p.emergencyContactName, p.emergencyContactPhone].filter(Boolean).join(" - "),
  );
  w.field(
    "Consentimiento datos de salud",
    p.consent
      ? `${CONSENT_LABELS[p.consent.type] ?? p.consent.type}${p.consent.givenAt ? ` (${fmtDate(p.consent.givenAt)})` : ""}`
      : "No registrado",
  );
  if (p.archivedAt) w.field("Paciente archivado", fmtDateTime(p.archivedAt));

  // ── 2. Ficha clínica ──
  w.section("2. Ficha clínica");
  const rec = copy.clinicalRecord;
  if (!rec) {
    w.text("El paciente no tiene ficha clínica registrada.", { color: GRAY });
  } else {
    const d = rec.data;
    w.text(`Creada ${fmtDateTime(rec.createdAt)} · Última modificación ${fmtDateTime(rec.updatedAt)}`, {
      size: 8.5,
      color: GRAY,
      after: 1,
    });
    w.field("Grupo sanguíneo", asText(d.bloodType));
    w.field("Altura", asText(d.heightCm) ? `${asText(d.heightCm)} cm` : "");
    w.field("Peso", asText(d.weightKg) ? `${asText(d.weightKg)} kg` : "");
    w.field("Alergias", asText(d.allergies));
    w.field(
      "Alergias estructuradas",
      d.structuredAllergies == null ? "" : describeStructuredAllergies(d.structuredAllergies),
    );
    w.field("Antecedentes personales", asText(d.personalHistory));
    w.field("Antecedentes familiares", asText(d.familyHistory));
    w.field("Medicación habitual", asText(d.currentMedication));
    w.field("Hábitos - tabaco", asText(d.habitsTobacco));
    w.field("Hábitos - alcohol", asText(d.habitsAlcohol));
    w.field("Hábitos - actividad física", asText(d.habitsActivity));
    w.field("Hábitos - alimentación", asText(d.habitsDiet));
    w.field("Notas", asText(d.notes));
    w.field("Campos de la especialidad", d.customFields == null ? "" : describeCustomFields(d.customFields));
    w.field("Odontograma", d.odontogram == null ? "" : describeOdontogram(d.odontogram));
    w.field("Genograma", d.genogram == null ? "" : describeGenogram(d.genogram));
    w.gap(1);
    w.text(ledgerLine(rec.ledger), { size: 7, mono: true, color: GRAY });
  }

  // ── 3. Asientos ──
  w.section(`3. Asientos de la historia clínica (${copy.entries.length})`);
  w.text(
    "Orden cronológico. Incluye los asientos de todos los profesionales del establecimiento. " +
      "Los asientos anulados se conservan y se muestran marcados como ANULADO (Ley 26.529, arts. 15 y 16).",
    { size: 8.5, color: GRAY, after: 2 },
  );
  if (copy.entries.length === 0) {
    w.text("No hay asientos registrados.", { color: GRAY });
  }
  copy.entries.forEach((e, idx) => {
    w.ensure(22);
    const annulled = e.annulment != null;
    const title = `${idx + 1}. ${fmtDateTime(e.createdAt)} · ${ENTRY_TITLES[e.entityType]}`;
    w.text(annulled ? `${title}  [ANULADO]` : title, {
      size: 10,
      bold: true,
      color: annulled ? RED : BLACK,
    });
    w.text(`Profesional: ${personLine(e.author)}`, { size: 9, color: GRAY, indent: 4, after: 0.5 });
    renderEntryData(w, e);
    if (e.annulment) {
      const by = e.annulment.by ? ` por ${personLine(e.annulment.by)}` : "";
      w.text(
        `ANULADO el ${fmtDateTime(e.annulment.at)}${by}. Motivo: ${e.annulment.reason?.trim() || "—"}`,
        { size: 9, bold: true, color: RED, indent: 4 },
      );
    }
    w.gap(0.5);
    w.text(ledgerLine(e.ledger), { size: 7, mono: true, color: GRAY, indent: 4, after: 1 });
    w.rule();
  });

  // Numeración de las secciones opcionales (concesiones, adjuntos).
  let sectionNo = 3;

  // ── Concesiones de acceso ──
  if (copy.accessGrants.length > 0) {
    w.section(`${++sectionNo}. Concesiones de acceso a la historia clínica`);
    w.text(
      "Profesionales a los que se concedió (o solicitó) acceso a esta historia clínica con autorización del paciente.",
      { size: 8.5, color: GRAY, after: 1.5 },
    );
    for (const g of copy.accessGrants) {
      w.text(
        `- ${personLine(g.grantedTo)} · Estado: ${GRANT_STATUS_LABELS[g.status] ?? g.status} · ` +
          `Solicitada: ${fmtDate(g.createdAt)} · Desde: ${fmtDate(g.startsAt)} · Hasta: ${fmtDate(g.expiresAt)}`,
        { size: 9, indent: 2 },
      );
    }
  }

  // ── Adjuntos ──
  const attachments = copy.attachments ?? [];
  if (attachments.length > 0) {
    w.section(`${++sectionNo}. Adjuntos (${attachments.length})`);
    w.text(
      "Archivos incorporados a la historia clínica (resultados, imágenes, informes). Se identifican por su " +
        "hash SHA-256: el archivo entregado debe producir el mismo hash. Los anulados se conservan marcados.",
      { size: 8.5, color: GRAY, after: 2 },
    );
    attachments.forEach((a, idx) => {
      w.ensure(20);
      const annulled = a.annulment != null;
      const title = `${idx + 1}. ${fmtDateTime(a.createdAt)} · ${a.fileName}`;
      w.text(annulled ? `${title}  [ANULADO]` : title, {
        size: 10,
        bold: true,
        color: annulled ? RED : BLACK,
      });
      w.text(`Profesional: ${personLine(a.author)}`, { size: 9, color: GRAY, indent: 4, after: 0.5 });
      w.field("Tipo", ATTACHMENT_MIME_LABELS[a.mimeType] ?? a.mimeType, { indent: 4 });
      w.field("Tamaño", fmtBytes(a.sizeBytes), { indent: 4 });
      w.field("Asociado a", ATTACHMENT_ENTITY_TITLES[a.entityType] ?? a.entityType, { indent: 4 });
      if (a.description?.trim()) w.field("Descripción", a.description, { indent: 4 });
      w.text(`SHA-256 del archivo: ${a.sha256}`, { size: 7.5, mono: true, indent: 4 });
      if (a.annulment) {
        const by = a.annulment.by ? ` por ${personLine(a.annulment.by)}` : "";
        w.text(
          `ANULADO el ${fmtDateTime(a.annulment.at)}${by}. Motivo: ${a.annulment.reason?.trim() || "—"}`,
          { size: 9, bold: true, color: RED, indent: 4 },
        );
      }
      w.gap(0.5);
      w.text(ledgerLine(a.ledger), { size: 7, mono: true, color: GRAY, indent: 4, after: 1 });
      w.rule();
    });
  }

  // ── Integridad y autenticación ──
  w.section(`${++sectionNo}. Integridad y autenticación`);
  w.text(
    "Hash SHA-256 del contenido canónico de esta copia (no incluye los datos de emisión). " +
      "Regenerar la copia con el mismo contenido produce el mismo hash. Cada asiento indica el hash " +
      "de su última versión en el registro inalterable (ledger) del sistema.",
    { size: 8.5, color: GRAY, after: 1 },
  );
  w.text(documentHash, { size: 8.5, mono: true, bold: true, after: 3 });
  w.text(HC_COPY_LEGEND, { size: 9, bold: true, after: 2 });

  w.ensure(40);
  w.y += 18;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(PAGE.left, w.y, PAGE.left + 75, w.y);
  doc.line(PAGE.right - 60, w.y, PAGE.right, w.y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text(pdfSafe("Firma y sello del responsable del establecimiento"), PAGE.left, w.y + 4.5);
  doc.text(pdfSafe("Aclaración, cargo y fecha"), PAGE.right - 60, w.y + 4.5);
  w.y += 10;

  // ── Encabezado corrido y pie en todas las páginas ──
  const pages = doc.getNumberOfPages();
  const runningHeader = pdfSafe(
    `Copia de HC · ${patientName}${p.dni ? ` · DNI ${p.dni}` : ""} · Solicitud ${meta.requestId}`,
  );
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY);
      doc.text(runningHeader, PAGE.left, 13);
      doc.text(pdfSafe(clinicName), PAGE.right, 13, { align: "right" });
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.line(PAGE.left, 15.5, PAGE.right, 15.5);
    }
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(PAGE.left, 276, PAGE.right, 276);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(pdfSafe(HC_COPY_LEGEND), PAGE.left, 280.5);
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`SHA-256 ${documentHash}`, PAGE.left, 285);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(pdfSafe(`Página ${i} de ${pages}`), PAGE.right, 285, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ─── Serialización de solicitudes para la API ────────────────────────────────

export function isHcCopyOverdue(
  r: { status: string; dueAt: Date | string },
  now: Date = new Date(),
): boolean {
  return r.status === "PENDING" && new Date(r.dueAt).getTime() < now.getTime();
}

/** Filas de HcCopyRequest → forma de la API, con nombres de quien registró / entregó. */
export async function toHcCopyRequestItems(
  rows: HcCopyRequest[],
  now: Date = new Date(),
): Promise<HcCopyRequestItem[]> {
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.registeredById);
    if (r.deliveredById) ids.add(r.deliveredById);
  }
  const userRows: UserRow[] =
    ids.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...ids] } },
          select: { id: true, name: true, firstName: true, lastName: true, licenseNumber: true },
        })
      : [];
  const users = new Map(userRows.map((u) => [u.id, u]));
  const ref = (id: string | null) => (id ? { id, name: personFrom(users, id).name } : null);

  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    requesterType: r.requesterType as HcCopyRequesterTypeValue,
    requesterName: r.requesterName,
    requesterDni: r.requesterDni ?? null,
    authorizationNote: r.authorizationNote ?? null,
    reason: r.reason ?? null,
    status: r.status as HcCopyStatusValue,
    requestedAt: isoRequired(r.requestedAt),
    dueAt: isoRequired(r.dueAt),
    overdue: isHcCopyOverdue(r, now),
    registeredBy: ref(r.registeredById),
    deliveredAt: iso(r.deliveredAt),
    deliveredBy: ref(r.deliveredById),
    deliveryNote: r.deliveryNote ?? null,
    documentHash: r.documentHash ?? null,
  }));
}
