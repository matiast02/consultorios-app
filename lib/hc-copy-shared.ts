// Copia de la historia clínica — piezas compartidas entre servidor y cliente
// (etiquetas en español, permisos por rol y tipos de la API). Sin imports de
// servidor: lo usan tanto lib/hc-copy.ts como components/pacientes/hc-copy-dialog.tsx.

export const HC_COPY_REQUESTER_TYPES = [
  "PATIENT",
  "LEGAL_REPRESENTATIVE",
  "HEIR",
  "EXTERNAL_PROFESSIONAL",
  "JUDICIAL",
] as const;
export type HcCopyRequesterTypeValue = (typeof HC_COPY_REQUESTER_TYPES)[number];

export const HC_COPY_STATUSES = ["PENDING", "DELIVERED", "CANCELLED"] as const;
export type HcCopyStatusValue = (typeof HC_COPY_STATUSES)[number];

/** Ley 26.529 art. 19: quiénes pueden pedir la copia. */
export const HC_COPY_REQUESTER_LABELS: Record<HcCopyRequesterTypeValue, string> = {
  PATIENT: "Paciente",
  LEGAL_REPRESENTATIVE: "Representante legal",
  HEIR: "Cónyuge, conviviente o heredero",
  EXTERNAL_PROFESSIONAL: "Profesional externo (con autorización)",
  JUDICIAL: "Orden judicial",
};

/** Ayuda para completar "cómo se acreditó el vínculo / la autorización". */
export const HC_COPY_AUTHORIZATION_HINTS: Record<HcCopyRequesterTypeValue, string> = {
  PATIENT: "Ej.: DNI exhibido en mostrador.",
  LEGAL_REPRESENTATIVE:
    "Ej.: partida de nacimiento (menor), designación de curador/apoyo o poder, con número y fecha.",
  HEIR:
    "Ej.: autorización escrita del paciente, o certificado de defunción + acta que acredita el vínculo.",
  EXTERNAL_PROFESSIONAL:
    "Ej.: autorización escrita y fechada del paciente; matrícula del profesional solicitante.",
  JUDICIAL: "Ej.: oficio judicial: juzgado, expediente N° y fecha.",
};

export const HC_COPY_STATUS_LABELS: Record<HcCopyStatusValue, string> = {
  PENDING: "Pendiente",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
};

/** Plazo legal de entrega (art. 14): 48 horas desde la solicitud. */
export const HC_COPY_DUE_HOURS = 48;

/** Registrar / listar / cancelar solicitudes (la secretaria atiende el mostrador). */
export const HC_COPY_REGISTER_ROLES = ["admin", "medic", "secretary"] as const;
/** Generar y ver el PDF (contenido clínico): solo roles clínicos. */
export const HC_COPY_DELIVER_ROLES = ["admin", "medic"] as const;

export function canRegisterHcCopy(role: string | null | undefined): boolean {
  return (HC_COPY_REGISTER_ROLES as readonly string[]).includes(role ?? "");
}

export function canDeliverHcCopy(role: string | null | undefined): boolean {
  return (HC_COPY_DELIVER_ROLES as readonly string[]).includes(role ?? "");
}

// ─── Tipos de la API (ver lib/openapi/paths) ───────

export interface HcCopyUserRef {
  id: string;
  name: string;
}

export interface HcCopyRequestItem {
  id: string;
  patientId: string;
  requesterType: HcCopyRequesterTypeValue;
  requesterName: string;
  requesterDni: string | null;
  authorizationNote: string | null;
  reason: string | null;
  status: HcCopyStatusValue;
  requestedAt: string;
  dueAt: string;
  overdue: boolean;
  registeredBy: HcCopyUserRef | null;
  deliveredAt: string | null;
  deliveredBy: HcCopyUserRef | null;
  deliveryNote: string | null;
  documentHash: string | null;
}

export interface HcCopyRequestSummary {
  id: string;
  patient: { id: string; firstName: string; lastName: string; dni: string | null };
  requesterType: HcCopyRequesterTypeValue;
  requesterName: string;
  status: HcCopyStatusValue;
  requestedAt: string;
  dueAt: string;
  deliveredAt: string | null;
  overdue: boolean;
}
