// ─── Anthropometric Tracking Types ──────────────────────────────────────────

export interface AnthropometricEntry {
  date: string; // ISO date
  weight: number; // kg
  height: number; // cm
  waist?: number; // cm
  hip?: number; // cm
  bmi: number; // auto-calculated
  bodyFat?: number; // %
  notes?: string;
}

export interface AnthropometricData {
  entries: AnthropometricEntry[];
  goals?: {
    targetWeight?: number;
    targetBmi?: number;
  };
  lastUpdated?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function calculateBMI(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) return 0;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function getBMICategory(bmi: number): {
  label: string;
  color: string;
} {
  if (bmi < 18.5) return { label: "Bajo peso", color: "#3B82F6" };
  if (bmi < 25) return { label: "Normal", color: "#10B981" };
  if (bmi < 30) return { label: "Sobrepeso", color: "#F59E0B" };
  if (bmi < 35) return { label: "Obesidad I", color: "#F97316" };
  if (bmi < 40) return { label: "Obesidad II", color: "#EF4444" };
  return { label: "Obesidad III", color: "#DC2626" };
}

export function calculateWaistHipRatio(waist: number, hip: number): number {
  if (hip <= 0) return 0;
  return Math.round((waist / hip) * 100) / 100;
}

export function createEmptyAnthropometricData(): AnthropometricData {
  return { entries: [] };
}
