// Constantes y helpers puros de las concesiones de acceso a la HC
// (ClinicalAccessGrant). Sin dependencias de servidor: se importan tanto desde
// lib/clinical-access.ts (backend) como desde la UI y lib/validations.ts.

/** Secciones que puede abarcar una concesión PARTIAL. */
export const GRANT_SECTIONS = [
  "antecedentes",
  "alergias",
  "medicacion",
  "evoluciones",
  "recetas",
  "estudios",
  "planes",
] as const;
export type GrantSection = (typeof GRANT_SECTIONS)[number];

/** Secciones que corresponden a campos de la ficha (ClinicalRecord). */
export const RECORD_SECTIONS = ["antecedentes", "alergias", "medicacion"] as const;
export type RecordSection = (typeof RECORD_SECTIONS)[number];

/**
 * Mapa sección → campos de ClinicalRecord que habilita. Todo campo que no esté
 * acá (grupo sanguíneo, antropometría, notas, customFields, odontograma,
 * genograma) solo se ve con ficha completa (tratante, admin o concesión FULL).
 */
export const RECORD_SECTION_FIELDS: Record<RecordSection, readonly string[]> = {
  antecedentes: [
    "personalHistory",
    "familyHistory",
    "habitsTobacco",
    "habitsAlcohol",
    "habitsActivity",
    "habitsDiet",
  ],
  alergias: ["allergies", "structuredAllergies"],
  medicacion: ["currentMedication"],
};

/** Tipos de asiento clínico con autor. */
export type EntryKind = "evolution" | "prescription" | "study_order" | "meal_plan";

/** Mapa tipo de asiento → sección de la concesión que lo cubre entero. */
export const ENTRY_KIND_SECTION: Record<EntryKind, GrantSection> = {
  evolution: "evoluciones",
  prescription: "recetas",
  study_order: "estudios",
  meal_plan: "planes",
};

export const GRANT_SECTION_LABELS: Record<GrantSection, string> = {
  antecedentes: "Antecedentes y hábitos",
  alergias: "Alergias",
  medicacion: "Medicación habitual",
  evoluciones: "Evoluciones",
  recetas: "Recetas",
  estudios: "Órdenes de estudio",
  planes: "Planes alimentarios",
};

export const GRANT_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "REVOKED", "EXPIRED"] as const;
export type GrantStatusValue = (typeof GRANT_STATUSES)[number];

export const GRANT_STATUS_LABELS: Record<GrantStatusValue, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Vigente",
  REJECTED: "Rechazada",
  REVOKED: "Revocada",
  EXPIRED: "Vencida",
};

export const GRANT_SCOPES = ["FULL", "PARTIAL"] as const;
export type GrantScopeValue = (typeof GRANT_SCOPES)[number];

export const CONSENT_TYPES = ["WRITTEN", "VERBAL_RECORDED", "DIGITAL_SIGNATURE"] as const;
export type ConsentTypeValue = (typeof CONSENT_TYPES)[number];

export const CONSENT_TYPE_LABELS: Record<ConsentTypeValue, string> = {
  WRITTEN: "Escrito firmado",
  VERBAL_RECORDED: "Verbal registrado",
  DIGITAL_SIGNATURE: "Firma digital",
};

/** Vigencia de una concesión aprobada (días). */
export const GRANT_DEFAULT_DAYS = 30;
export const GRANT_MAX_DAYS = 180;

export function isGrantSection(v: unknown): v is GrantSection {
  return typeof v === "string" && (GRANT_SECTIONS as readonly string[]).includes(v);
}

export function isRecordSection(v: unknown): v is RecordSection {
  return typeof v === "string" && (RECORD_SECTIONS as readonly string[]).includes(v);
}

/** Texto corto del alcance: "Completo" o "Antecedentes y hábitos, Recetas…". */
export function describeGrantScope(
  scope: GrantScopeValue,
  sections: readonly string[],
  entryIds: readonly string[] = [],
): string {
  if (scope === "FULL") return "Completo";
  const parts = sections.filter(isGrantSection).map((s) => GRANT_SECTION_LABELS[s]);
  if (entryIds.length > 0) {
    parts.push(`${entryIds.length} ${entryIds.length === 1 ? "registro puntual" : "registros puntuales"}`);
  }
  return parts.length > 0 ? parts.join(", ") : "Parcial";
}
