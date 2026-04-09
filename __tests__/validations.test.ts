import { describe, it, expect } from "vitest";
import {
  createShiftSchema,
  createRecurringShiftsSchema,
  addBlockDaysSchema,
  createConsultationTypeSchema,
} from "@/lib/validations";

// ─── createShiftSchema ─────────────────────────────────────────────────────

describe("createShiftSchema", () => {
  const validShift = {
    userId: "user-1",
    patientId: "patient-1",
    start: "2026-04-13T10:00:00.000Z",
    end: "2026-04-13T10:30:00.000Z",
  };

  it("acepta turno valido con campos minimos", () => {
    const result = createShiftSchema.safeParse(validShift);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("PENDING"); // default
      expect(result.data.isOverbook).toBe(false); // default
    }
  });

  it("acepta turno con todos los campos opcionales", () => {
    const result = createShiftSchema.safeParse({
      ...validShift,
      observations: "Paciente con fiebre",
      status: "CONFIRMED",
      isOverbook: true,
      consultationTypeId: "type-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("CONFIRMED");
      expect(result.data.isOverbook).toBe(true);
      expect(result.data.consultationTypeId).toBe("type-1");
    }
  });

  it("rechaza sin userId", () => {
    const result = createShiftSchema.safeParse({
      ...validShift,
      userId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza sin patientId", () => {
    const result = createShiftSchema.safeParse({
      ...validShift,
      patientId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza sin start", () => {
    const result = createShiftSchema.safeParse({
      ...validShift,
      start: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza sin end", () => {
    const result = createShiftSchema.safeParse({
      ...validShift,
      end: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza status invalido", () => {
    const result = createShiftSchema.safeParse({
      ...validShift,
      status: "INVALID_STATUS",
    });
    expect(result.success).toBe(false);
  });

  it("acepta observations null", () => {
    const result = createShiftSchema.safeParse({
      ...validShift,
      observations: null,
    });
    expect(result.success).toBe(true);
  });
});

// ─── createRecurringShiftsSchema ────────────────────────────────────────────

describe("createRecurringShiftsSchema", () => {
  const validRecurring = {
    userId: "user-1",
    patientId: "patient-1",
    startDate: "2026-04-13",
    startTime: "10:00",
    endTime: "10:30",
    frequencyWeeks: 2,
    count: 4,
  };

  it("acepta datos validos", () => {
    const result = createRecurringShiftsSchema.safeParse(validRecurring);
    expect(result.success).toBe(true);
  });

  it("acepta con consultationTypeId", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      consultationTypeId: "type-1",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza frequencyWeeks = 0", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      frequencyWeeks: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza frequencyWeeks > 4", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      frequencyWeeks: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza count = 1 (minimo 2)", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      count: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza count > 12", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      count: 13,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza formato de hora invalido", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      startTime: "9:00", // missing leading zero
    });
    expect(result.success).toBe(false);
  });

  it("rechaza hora 25:00", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      startTime: "25:00",
    });
    expect(result.success).toBe(false);
  });

  it("acepta hora limite 23:59", () => {
    const result = createRecurringShiftsSchema.safeParse({
      ...validRecurring,
      startTime: "23:59",
    });
    expect(result.success).toBe(true);
  });
});

// ─── addBlockDaysSchema ─────────────────────────────────────────────────────

describe("addBlockDaysSchema", () => {
  it("acepta datos validos", () => {
    const result = addBlockDaysSchema.safeParse({
      userId: "user-1",
      dates: ["2026-04-15", "2026-04-16"],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza sin userId", () => {
    const result = addBlockDaysSchema.safeParse({
      userId: "",
      dates: ["2026-04-15"],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza array vacio de dates", () => {
    const result = addBlockDaysSchema.safeParse({
      userId: "user-1",
      dates: [],
    });
    expect(result.success).toBe(false);
  });
});

// ─── createConsultationTypeSchema ───────────────────────────────────────────

describe("createConsultationTypeSchema", () => {
  it("acepta datos validos", () => {
    const result = createConsultationTypeSchema.safeParse({
      name: "Control",
      durationMinutes: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDefault).toBe(false); // default
    }
  });

  it("rechaza nombre vacio", () => {
    const result = createConsultationTypeSchema.safeParse({
      name: "",
      durationMinutes: 20,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza duracion menor a 5 minutos", () => {
    const result = createConsultationTypeSchema.safeParse({
      name: "Rapido",
      durationMinutes: 3,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza duracion mayor a 120 minutos", () => {
    const result = createConsultationTypeSchema.safeParse({
      name: "Largo",
      durationMinutes: 150,
    });
    expect(result.success).toBe(false);
  });

  it("acepta con color y isDefault", () => {
    const result = createConsultationTypeSchema.safeParse({
      name: "Primera vez",
      durationMinutes: 40,
      color: "#8B5CF6",
      isDefault: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDefault).toBe(true);
      expect(result.data.color).toBe("#8B5CF6");
    }
  });
});
