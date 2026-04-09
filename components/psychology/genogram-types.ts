// ─── Genogram Types ───────────────────────────────────────────────────────────

export interface GenogramMember {
  id: string;
  name: string;
  age?: number;
  gender: "male" | "female" | "other";
  relationship: string; // "Paciente", "Padre", "Madre", "Hermano/a", "Abuelo/a paterno", "Abuelo/a materno", "Pareja", "Hijo/a"
  isPatient?: boolean;
  notes?: string;
  conditions?: string; // "Depresión, Alcoholismo", etc.
}

export interface GenogramRelation {
  from: string; // member id
  to: string;   // member id
  type: "married" | "separated" | "close" | "conflictive" | "distant";
}

export interface GenogramData {
  members: GenogramMember[];
  relations: GenogramRelation[];
  notes?: string;
  lastUpdated?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const RELATIONSHIP_OPTIONS = [
  "Paciente",
  "Padre",
  "Madre",
  "Hermano",
  "Hermana",
  "Abuelo paterno",
  "Abuela paterna",
  "Abuelo materno",
  "Abuela materna",
  "Pareja",
  "Ex pareja",
  "Hijo/a",
  "Tío/a",
  "Primo/a",
  "Otro",
] as const;

export const RELATION_TYPE_LABELS: Record<GenogramRelation["type"], string> = {
  married: "Unidos/Casados",
  separated: "Separados",
  close: "Muy cercana",
  conflictive: "Conflictiva",
  distant: "Distante",
};

export const RELATION_TYPE_COLORS: Record<GenogramRelation["type"], string> = {
  married: "#10B981",
  separated: "#F59E0B",
  close: "#3B82F6",
  conflictive: "#EF4444",
  distant: "#6B7280",
};

export const GENDER_LABELS: Record<GenogramMember["gender"], string> = {
  male: "Masculino",
  female: "Femenino",
  other: "Otro/No binario",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function createEmptyGenogramData(patientName?: string): GenogramData {
  const patientId = "patient-" + Date.now();
  return {
    members: [
      {
        id: patientId,
        name: patientName ?? "Paciente",
        gender: "other",
        relationship: "Paciente",
        isPatient: true,
      },
    ],
    relations: [],
    notes: "",
  };
}

export function generateFamilySummary(data: GenogramData): string {
  const patient = data.members.find((m) => m.isPatient);
  if (!data.members.length) return "Sin datos familiares cargados.";

  const others = data.members.filter((m) => !m.isPatient);
  if (others.length === 0) {
    return patient ? `Paciente: ${patient.name}.` : "Sin datos familiares cargados.";
  }

  // Group by relationship category
  const groups: Record<string, GenogramMember[]> = {};
  for (const m of others) {
    if (!groups[m.relationship]) groups[m.relationship] = [];
    groups[m.relationship].push(m);
  }

  const parts: string[] = [];
  for (const [rel, members] of Object.entries(groups)) {
    const names = members
      .map((m) => `${m.name}${m.age ? ` (${m.age}a)` : ""}`)
      .join(", ");
    parts.push(`${rel}: ${names}`);
  }

  const membersWithConditions = data.members.filter(
    (m) => m.conditions && m.conditions.trim()
  );

  let summary = "Nucleo familiar: " + parts.join(" | ");

  if (membersWithConditions.length > 0) {
    const condParts = membersWithConditions.map(
      (m) => `${m.name} (${m.relationship}) - ${m.conditions}`
    );
    summary += ". Antecedentes relevantes: " + condParts.join("; ");
  }

  return summary;
}
