// ─── Dental Odontogram Types ────────────────────────────────────────────────

export type FaceStatus =
  | "healthy"
  | "caries"
  | "restoration"
  | "crown"
  | "endodontics"
  | "fracture";

export type ToothGeneralStatus = "healthy" | "missing" | "implant";

export type Face = "V" | "P" | "M" | "D" | "O";

export interface ToothData {
  status: ToothGeneralStatus;
  faces: Partial<Record<Face, FaceStatus>>;
  notes?: string;
}

export interface OdontogramData {
  teeth: Record<string, ToothData>;
  notes?: string;
  lastUpdated?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const FACE_STATUS_COLORS: Record<FaceStatus, string> = {
  healthy: "transparent",
  caries: "#EF4444",
  restoration: "#3B82F6",
  crown: "#F59E0B",
  endodontics: "#10B981",
  fracture: "#F97316",
};

export const TOOTH_STATUS_COLORS: Record<ToothGeneralStatus, string> = {
  healthy: "transparent",
  missing: "#6B7280",
  implant: "#06B6D4",
};

export const FACE_STATUS_LABELS: Record<FaceStatus, string> = {
  healthy: "Sano",
  caries: "Caries",
  restoration: "Restauración",
  crown: "Corona",
  endodontics: "Endodoncia",
  fracture: "Fractura",
};

export const TOOTH_STATUS_LABELS: Record<ToothGeneralStatus, string> = {
  healthy: "Presente",
  missing: "Ausente",
  implant: "Implante",
};

export const FACE_LABELS: Record<Face, string> = {
  V: "Vestibular",
  P: "Palatino/Lingual",
  M: "Mesial",
  D: "Distal",
  O: "Oclusal/Incisal",
};

// FDI numbering system — 4 quadrants
// Upper right: 18-11, Upper left: 21-28
// Lower left: 31-38, Lower right: 48-41
export const UPPER_RIGHT = ["18", "17", "16", "15", "14", "13", "12", "11"];
export const UPPER_LEFT = ["21", "22", "23", "24", "25", "26", "27", "28"];
export const LOWER_LEFT = ["31", "32", "33", "34", "35", "36", "37", "38"];
export const LOWER_RIGHT = ["48", "47", "46", "45", "44", "43", "42", "41"];

export const ALL_TEETH = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_LEFT, ...LOWER_RIGHT];

export const FACE_CYCLE: FaceStatus[] = ["healthy", "caries", "restoration", "crown", "endodontics", "fracture"];

export function createEmptyOdontogram(): OdontogramData {
  const teeth: Record<string, ToothData> = {};
  for (const tooth of ALL_TEETH) {
    teeth[tooth] = {
      status: "healthy",
      faces: {},
    };
  }
  return { teeth, notes: "" };
}

export function calculateCPOD(data: OdontogramData): {
  C: number;
  P: number;
  O: number;
  total: number;
} {
  let C = 0;
  let P = 0;
  let O = 0;

  for (const tooth of ALL_TEETH) {
    const t = data.teeth[tooth];
    if (!t) continue;

    if (t.status === "missing") {
      P++;
      continue;
    }

    const faceValues = Object.values(t.faces);
    const hasCaries = faceValues.some((f) => f === "caries");
    const hasRestoration = faceValues.some((f) => f === "restoration" || f === "crown");

    if (hasCaries) {
      C++;
    } else if (hasRestoration) {
      O++;
    }
  }

  return { C, P, O, total: C + P + O };
}
