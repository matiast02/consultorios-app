import { describe, it, expect } from "vitest";
import {
  createMealPlanSchema,
  createStudyOrderSchema,
  createProfessionConfigSchema,
  mealSectionSchema,
  studyOrderItemSchema,
} from "@/lib/validations";

// ─── createMealPlanSchema ──────────────────────────────────────────────────

describe("createMealPlanSchema", () => {
  const validMealPlan = {
    userId: "user-1",
    patientId: "patient-1",
    title: "Plan semanal",
    meals: [
      { name: "Desayuno", options: "Avena con frutas" },
      { name: "Almuerzo", options: "Pollo con verduras" },
    ],
  };

  it("acepta datos validos", () => {
    const result = createMealPlanSchema.safeParse(validMealPlan);
    expect(result.success).toBe(true);
  });

  it("acepta con todos los campos opcionales", () => {
    const result = createMealPlanSchema.safeParse({
      ...validMealPlan,
      targetCalories: 2000,
      proteinPct: 30,
      carbsPct: 50,
      fatPct: 20,
      hydration: "2 litros de agua",
      avoidFoods: "Lacteos",
      supplements: "Vitamina D",
      notes: "Notas adicionales",
      shiftId: "shift-1",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza titulo vacio", () => {
    const result = createMealPlanSchema.safeParse({
      ...validMealPlan,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza array de meals vacio", () => {
    const result = createMealPlanSchema.safeParse({
      ...validMealPlan,
      meals: [],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza calorias fuera de rango", () => {
    const result = createMealPlanSchema.safeParse({
      ...validMealPlan,
      targetCalories: 100, // min is 500
    });
    expect(result.success).toBe(false);
  });
});

// ─── createStudyOrderSchema ────────────────────────────────────────────────

describe("createStudyOrderSchema", () => {
  const validStudyOrder = {
    userId: "user-1",
    patientId: "patient-1",
    items: [
      { type: "laboratorio", description: "Hemograma completo" },
    ],
  };

  it("acepta datos validos", () => {
    const result = createStudyOrderSchema.safeParse(validStudyOrder);
    expect(result.success).toBe(true);
  });

  it("acepta con shiftId opcional", () => {
    const result = createStudyOrderSchema.safeParse({
      ...validStudyOrder,
      shiftId: "shift-1",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza items vacio", () => {
    const result = createStudyOrderSchema.safeParse({
      ...validStudyOrder,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza sin patientId", () => {
    const result = createStudyOrderSchema.safeParse({
      ...validStudyOrder,
      patientId: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── createProfessionConfigSchema ──────────────────────────────────────────

describe("createProfessionConfigSchema", () => {
  const validConfig = {
    code: "MED",
    name: "Medicina General",
    professionalLabel: "Medico",
    patientLabel: "Paciente",
    prescriptionLabel: "Receta",
    evolutionLabel: "Evolucion",
    clinicalRecordLabel: "Historia Clinica",
  };

  it("acepta datos validos", () => {
    const result = createProfessionConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabledModules).toEqual([]); // default
      expect(result.data.clinicalFields).toEqual([]); // default
    }
  });

  it("acepta con modulos y campos clinicos", () => {
    const result = createProfessionConfigSchema.safeParse({
      ...validConfig,
      enabledModules: ["prescriptions", "studies"],
      clinicalFields: ["bloodType", "allergies"],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza code vacio", () => {
    const result = createProfessionConfigSchema.safeParse({
      ...validConfig,
      code: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza name vacio", () => {
    const result = createProfessionConfigSchema.safeParse({
      ...validConfig,
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── mealSectionSchema ────────────────────────────────────────────────────

describe("mealSectionSchema", () => {
  it("acepta meal valido", () => {
    const result = mealSectionSchema.safeParse({
      name: "Desayuno",
      options: "Avena con frutas y yogur",
    });
    expect(result.success).toBe(true);
  });

  it("acepta con time opcional", () => {
    const result = mealSectionSchema.safeParse({
      name: "Almuerzo",
      time: "12:30",
      options: "Ensalada completa",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza name vacio", () => {
    const result = mealSectionSchema.safeParse({
      name: "",
      options: "Algo",
    });
    expect(result.success).toBe(false);
  });
});

// ─── studyOrderItemSchema ──────────────────────────────────────────────────

describe("studyOrderItemSchema", () => {
  it("acepta item valido", () => {
    const result = studyOrderItemSchema.safeParse({
      type: "laboratorio",
      description: "Hemograma completo",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.urgency).toBe("normal"); // default
    }
  });

  it("acepta con urgencia y notas", () => {
    const result = studyOrderItemSchema.safeParse({
      type: "imagen",
      description: "Radiografia de torax",
      urgency: "urgente",
      notes: "Lateral y frente",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza tipo invalido", () => {
    const result = studyOrderItemSchema.safeParse({
      type: "desconocido",
      description: "Algo",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza descripcion vacia", () => {
    const result = studyOrderItemSchema.safeParse({
      type: "laboratorio",
      description: "",
    });
    expect(result.success).toBe(false);
  });
});
