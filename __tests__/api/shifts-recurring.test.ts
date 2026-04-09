import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { POST } from "@/app/api/shifts/recurring/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(
  body: Record<string, unknown>,
  method = "POST"
): NextRequest {
  return new NextRequest("http://localhost:3000/api/shifts/recurring", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A valid base payload for recurring shifts (4 shifts every 2 weeks). */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    userId: "medic-1",
    patientId: "patient-1",
    startDate: "2026-05-04", // Monday
    startTime: "09:00",
    endTime: "09:30",
    frequencyWeeks: 2,
    count: 4,
    consultationTypeId: null,
    ...overrides,
  };
}

/** Helper: build a mock shift.create return value. */
function mockCreatedShift(idx: number, groupId: string) {
  return {
    id: `shift-${idx}`,
    recurrenceGroupId: groupId,
    status: "PENDING",
    patient: {
      id: "patient-1",
      firstName: "Juan",
      lastName: "Perez",
      dni: "12345678",
      os: null,
    },
    user: {
      id: "medic-1",
      name: "Dr. Test",
      firstName: "Test",
      lastName: "Doctor",
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/shifts/recurring", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // 1. Happy path --------------------------------------------------------

  it("crea serie de turnos recurrentes", async () => {
    // Patient exists
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      firstName: "Juan",
      lastName: "Perez",
      deletedAt: null,
    });

    // No block days, no preferences (no restrictions), no conflicts
    prismaMock.blockDay.findMany.mockResolvedValue([]);
    prismaMock.userPreference.findMany.mockResolvedValue([]);
    prismaMock.shift.findFirst.mockResolvedValue(null); // no conflicts

    // $transaction receives an array of prisma.shift.create(...) calls.
    // Each call is already a Promise resolved by the model mock, so
    // $transaction (which does Promise.all on arrays) will resolve them.
    // We need shift.create to return distinguishable objects per call.
    let callCount = 0;
    prismaMock.shift.create.mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        mockCreatedShift(callCount, "any-group-id")
      );
    });

    const req = createRequest(validPayload());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.created).toHaveLength(4);
    expect(json.data.recurrenceGroupId).toBeTruthy();
    expect(json.data.skipped).toHaveLength(0);
  });

  // 2. Auth ---------------------------------------------------------------

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const req = createRequest(validPayload());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  // 3. Validation ---------------------------------------------------------

  it("rechaza datos invalidos (frequencyWeeks fuera de rango)", async () => {
    const req = createRequest(validPayload({ frequencyWeeks: 10 }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Datos inv");
  });

  it("rechaza si endTime es anterior o igual a startTime", async () => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: "patient-1", deletedAt: null });

    const req = createRequest(validPayload({ startTime: "10:00", endTime: "09:00" }));
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("hora de fin");
  });

  // 4. Blocked days -------------------------------------------------------

  it("salta dias bloqueados con razon", async () => {
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      deletedAt: null,
    });
    prismaMock.userPreference.findMany.mockResolvedValue([]);
    prismaMock.shift.findFirst.mockResolvedValue(null);

    // Block the first two generated dates: 2026-05-04 and 2026-05-18
    prismaMock.blockDay.findMany.mockResolvedValue([
      { id: "bd-1", userId: "medic-1", date: new Date(2026, 4, 4) },
      { id: "bd-2", userId: "medic-1", date: new Date(2026, 4, 18) },
    ]);

    let callCount = 0;
    prismaMock.shift.create.mockImplementation(() => {
      callCount++;
      return Promise.resolve(mockCreatedShift(callCount, "grp-1"));
    });

    const req = createRequest(validPayload());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // 2 of 4 dates are blocked
    expect(json.data.skipped).toHaveLength(2);
    expect(json.data.skipped[0].reason).toContain("bloqueado");
    expect(json.data.skipped[1].reason).toContain("bloqueado");

    // Remaining 2 created
    expect(json.data.created).toHaveLength(2);
  });

  // 5. No work hours configured ------------------------------------------

  it("salta dias sin horario configurado", async () => {
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      deletedAt: null,
    });
    prismaMock.blockDay.findMany.mockResolvedValue([]);
    prismaMock.shift.findFirst.mockResolvedValue(null);

    // Only configure preferences for Tuesday (day=2).
    // The startDate 2026-05-04 is a Monday (day=1), so all generated dates
    // fall on Mondays and the preference has AM hours that don't include 09:00-09:30.
    // Actually, preferences exist for the day but hours don't fit:
    prismaMock.userPreference.findMany.mockResolvedValue([
      {
        id: "pref-1",
        userId: "medic-1",
        day: 1, // Monday
        fromHourAM: "14:00",
        toHourAM: "18:00",
        fromHourPM: null,
        toHourPM: null,
      },
    ]);

    const req = createRequest(validPayload());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // All 4 dates are Mondays; preference exists but shift time 09:00-09:30
    // is outside the configured 14:00-18:00 slot
    expect(json.data.skipped).toHaveLength(4);
    expect(json.data.skipped[0].reason).toContain("horario de atenci");
    expect(json.data.created).toHaveLength(0);
  });

  // 6. Schedule conflicts -------------------------------------------------

  it("salta turnos con conflictos de horario", async () => {
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      deletedAt: null,
    });
    prismaMock.blockDay.findMany.mockResolvedValue([]);
    prismaMock.userPreference.findMany.mockResolvedValue([]);

    // First two calls to findFirst return a conflict; rest return null
    let findFirstCalls = 0;
    prismaMock.shift.findFirst.mockImplementation(() => {
      findFirstCalls++;
      if (findFirstCalls <= 2) {
        return Promise.resolve({
          id: `existing-shift-${findFirstCalls}`,
          start: new Date(2026, 4, 4, 9, 0),
          end: new Date(2026, 4, 4, 9, 30),
          patient: { firstName: "Maria", lastName: "Lopez" },
        });
      }
      return Promise.resolve(null);
    });

    let createCalls = 0;
    prismaMock.shift.create.mockImplementation(() => {
      createCalls++;
      return Promise.resolve(mockCreatedShift(createCalls, "grp-2"));
    });

    const req = createRequest(validPayload());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.skipped).toHaveLength(2);
    expect(json.data.skipped[0].reason).toContain("Conflicto");
    expect(json.data.created).toHaveLength(2);
  });

  // 7. All skipped => recurrenceGroupId null ------------------------------

  it("retorna recurrenceGroupId null si todos fueron omitidos", async () => {
    prismaMock.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      deletedAt: null,
    });
    prismaMock.userPreference.findMany.mockResolvedValue([]);

    // Block all four generated dates
    // Dates: 2026-05-04, 2026-05-18, 2026-06-01, 2026-06-15
    prismaMock.blockDay.findMany.mockResolvedValue([
      { id: "bd-1", userId: "medic-1", date: new Date(2026, 4, 4) },
      { id: "bd-2", userId: "medic-1", date: new Date(2026, 4, 18) },
      { id: "bd-3", userId: "medic-1", date: new Date(2026, 5, 1) },
      { id: "bd-4", userId: "medic-1", date: new Date(2026, 5, 15) },
    ]);

    const req = createRequest(validPayload());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.created).toHaveLength(0);
    expect(json.data.recurrenceGroupId).toBeNull();
    expect(json.data.skipped).toHaveLength(4);
  });

  // 8. Patient not found --------------------------------------------------

  it("rechaza si paciente no existe", async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);

    const req = createRequest(validPayload());
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Paciente no encontrado");
  });
});
