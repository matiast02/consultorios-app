// Force UTC so getHours()/getMinutes() in the route are predictable
process.env.TZ = "UTC";

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { POST } from "@/app/api/shifts/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  userId: "medic-1",
  patientId: "patient-1",
  start: "2026-04-13T10:00:00.000Z",
  end: "2026-04-13T10:30:00.000Z",
  status: "PENDING",
};

const SHIFT_RESULT = {
  id: "shift-1",
  userId: "medic-1",
  patientId: "patient-1",
  start: new Date("2026-04-13T10:00:00.000Z"),
  end: new Date("2026-04-13T10:30:00.000Z"),
  observations: null,
  status: "PENDING",
  isOverbook: false,
  consultationTypeId: null,
  patient: {
    id: "patient-1",
    firstName: "Juan",
    lastName: "Perez",
    dni: "12345678",
    os: null,
  },
  user: {
    id: "medic-1",
    name: "Dr. Smith",
    firstName: "John",
    lastName: "Smith",
  },
  consultationType: null,
};

/** Set up the default mocks so a valid shift passes all checks. */
function mockHappyPath() {
  // No conflicts
  prismaMock.shift.findFirst.mockResolvedValue(null);
  // No blocked days
  prismaMock.blockDay.findFirst.mockResolvedValue(null);
  // No preferences configured (allows any time)
  prismaMock.userPreference.findUnique.mockResolvedValue(null);
  // Patient exists
  prismaMock.patient.findFirst.mockResolvedValue({
    id: "patient-1",
    firstName: "Juan",
    lastName: "Perez",
    deletedAt: null,
  });
  // Shift create succeeds
  prismaMock.shift.create.mockResolvedValue(SHIFT_RESULT);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/shifts", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // 1. Happy path
  it("crea turno valido", async () => {
    mockHappyPath();

    const res = await POST(createRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(expect.objectContaining({ id: "shift-1" }));
    expect(prismaMock.shift.create).toHaveBeenCalledOnce();
  });

  // 2. Auth
  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await POST(createRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain("No autorizado");
  });

  // 3. Invalid data
  it("rechaza datos invalidos", async () => {
    const res = await POST(createRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Datos inválidos");
    expect(json.details).toBeDefined();
  });

  // 4. End <= Start
  it("rechaza si hora fin es menor o igual a hora inicio", async () => {
    const body = {
      ...VALID_BODY,
      start: "2026-04-13T10:30:00.000Z",
      end: "2026-04-13T10:00:00.000Z",
    };
    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("fecha de fin");
  });

  // 5. Conflict
  it("detecta conflicto de horario y retorna SHIFT_CONFLICT", async () => {
    prismaMock.shift.findFirst.mockResolvedValue({
      id: "existing-shift",
      userId: "medic-1",
      start: new Date("2026-04-13T10:00:00.000Z"),
      end: new Date("2026-04-13T10:30:00.000Z"),
      status: "CONFIRMED",
      patient: { firstName: "Maria", lastName: "Lopez" },
    });

    const res = await POST(createRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.code).toBe("SHIFT_CONFLICT");
    expect(json.conflictDetails).toBeDefined();
    expect(json.conflictDetails.shiftId).toBe("existing-shift");
    expect(json.conflictDetails.patient).toContain("Lopez");
  });

  // 6. Overbook bypasses conflict
  it("permite sobreturno con isOverbook: true", async () => {
    // Conflict exists
    prismaMock.shift.findFirst.mockResolvedValue({
      id: "existing-shift",
      userId: "medic-1",
      start: new Date("2026-04-13T10:00:00.000Z"),
      end: new Date("2026-04-13T10:30:00.000Z"),
      status: "CONFIRMED",
      patient: { firstName: "Maria", lastName: "Lopez" },
    });
    // Rest of happy path
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    prismaMock.userPreference.findUnique.mockResolvedValue(null);
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      firstName: "Juan",
      lastName: "Perez",
      deletedAt: null,
    });
    prismaMock.shift.create.mockResolvedValue({
      ...SHIFT_RESULT,
      isOverbook: true,
    });

    const body = { ...VALID_BODY, isOverbook: true };
    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(prismaMock.shift.create).toHaveBeenCalledOnce();
    expect(prismaMock.shift.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isOverbook: true }),
      })
    );
  });

  // 7. Blocked day
  it("rechaza turno en dia bloqueado", async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null); // no conflict
    prismaMock.blockDay.findFirst.mockResolvedValue({
      id: "block-1",
      userId: "medic-1",
      date: new Date("2026-04-13T00:00:00.000Z"),
    });

    const res = await POST(createRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toContain("bloqueado");
  });

  // 8. Outside work hours
  it("rechaza turno fuera del horario de atencion", async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null);
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    // AM slot 09:00-12:00 only — shift at 14:00 should be rejected
    // 2026-04-13 is a Monday (dayOfWeek = 1)
    prismaMock.userPreference.findUnique.mockResolvedValue({
      userId: "medic-1",
      day: 1,
      fromHourAM: "09:00",
      toHourAM: "12:00",
      fromHourPM: null,
      toHourPM: null,
    });

    const body = {
      ...VALID_BODY,
      start: "2026-04-13T14:00:00.000Z",
      end: "2026-04-13T14:30:00.000Z",
    };
    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toContain("horario de atención");
  });

  // 9. Within AM slot
  it("permite turno dentro del horario AM", async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null);
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    prismaMock.userPreference.findUnique.mockResolvedValue({
      userId: "medic-1",
      day: 1,
      fromHourAM: "09:00",
      toHourAM: "12:00",
      fromHourPM: null,
      toHourPM: null,
    });
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      firstName: "Juan",
      lastName: "Perez",
      deletedAt: null,
    });
    prismaMock.shift.create.mockResolvedValue(SHIFT_RESULT);

    const body = {
      ...VALID_BODY,
      start: "2026-04-13T10:00:00.000Z",
      end: "2026-04-13T10:30:00.000Z",
    };
    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  // 10. Within PM slot
  it("permite turno dentro del horario PM", async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null);
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    prismaMock.userPreference.findUnique.mockResolvedValue({
      userId: "medic-1",
      day: 1,
      fromHourAM: null,
      toHourAM: null,
      fromHourPM: "14:00",
      toHourPM: "18:00",
    });
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      firstName: "Juan",
      lastName: "Perez",
      deletedAt: null,
    });
    prismaMock.shift.create.mockResolvedValue({
      ...SHIFT_RESULT,
      start: new Date("2026-04-13T15:00:00.000Z"),
      end: new Date("2026-04-13T15:30:00.000Z"),
    });

    const body = {
      ...VALID_BODY,
      start: "2026-04-13T15:00:00.000Z",
      end: "2026-04-13T15:30:00.000Z",
    };
    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  // 11. No preferences configured
  it("permite turno sin preferencias configuradas", async () => {
    mockHappyPath();
    // Explicitly ensure no preferences
    prismaMock.userPreference.findUnique.mockResolvedValue(null);

    const res = await POST(createRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  // 12. Patient not found
  it("rechaza paciente inexistente", async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null);
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    prismaMock.userPreference.findUnique.mockResolvedValue(null);
    prismaMock.patient.findFirst.mockResolvedValue(null);

    const res = await POST(createRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Paciente no encontrado");
  });

  // 13. consultationTypeId passed through
  it("guarda consultationTypeId cuando se proporciona", async () => {
    mockHappyPath();
    prismaMock.shift.create.mockResolvedValue({
      ...SHIFT_RESULT,
      consultationTypeId: "type-1",
    });

    const body = { ...VALID_BODY, consultationTypeId: "type-1" };
    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(prismaMock.shift.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consultationTypeId: "type-1" }),
      })
    );
  });
});
