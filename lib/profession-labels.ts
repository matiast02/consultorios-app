// Centralized profession label system
// Used across the app to render dynamic labels based on the professional's config

export interface ProfessionLabels {
  professionalLabel: string;  // "Dr/a.", "Lic.", "Od."
  patientLabel: string;       // "Paciente"
  prescriptionLabel: string;  // "Receta" / "Indicación" / "Plan de tratamiento"
  evolutionLabel: string;     // "Evolución" / "Nota de sesión" / "Registro odontológico"
  clinicalRecordLabel: string; // "Historia Clínica" / "Ficha Psicológica" / "Ficha Dental"
  professionName: string;     // "Médico" / "Psicólogo" / "Dentista"
}

export const DEFAULT_LABELS: ProfessionLabels = {
  professionalLabel: "Dr/a.",
  patientLabel: "Paciente",
  prescriptionLabel: "Receta",
  evolutionLabel: "Evolución",
  clinicalRecordLabel: "Historia Clínica",
  professionName: "Profesional",
};

// Clinical field definitions for dynamic forms
export interface ClinicalFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[]; // for select type
}

export const ALL_CLINICAL_FIELDS: Record<string, ClinicalFieldDef> = {
  // Medical fields
  bloodType: { key: "bloodType", label: "Grupo sanguíneo", type: "select", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  allergies: { key: "allergies", label: "Alergias", type: "textarea" },
  personalHistory: { key: "personalHistory", label: "Antecedentes personales", type: "textarea" },
  familyHistory: { key: "familyHistory", label: "Antecedentes familiares", type: "textarea" },
  currentMedication: { key: "currentMedication", label: "Medicación habitual", type: "textarea" },
  // Psychology fields
  consultReason: { key: "consultReason", label: "Motivo de consulta", type: "textarea" },
  previousTherapy: { key: "previousTherapy", label: "Terapias anteriores", type: "textarea" },
  psychodiagnosis: { key: "psychodiagnosis", label: "Psicodiagnóstico", type: "textarea" },
  // Dentistry fields
  dentalHistory: { key: "dentalHistory", label: "Antecedentes dentales", type: "textarea" },
  odontogram: { key: "odontogram", label: "Odontograma", type: "textarea" }, // Placeholder — visual editor future
};
