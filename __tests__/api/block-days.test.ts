import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { PUT, DELETE } from "@/app/api/preferences/block-days/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(
  body: Record<string, unknown>,
  method = "PUT"
): NextRequest {
  return new NextRequest("http://localhost:3000/api/preferences/block-days", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validPutPayload(overrides: Record<string, unknown> = {}) {
  return {
    userId: "medic-1",
    dates: ["2026-06-10"], // a Wednesday
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PUT /api/preferences/block-days
// ---------------------------------------------------------------------------

describe("PUT /api/preferences/block-days", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // 1. Happy path: no conflicting shifts ----------------------------------

  it("crea dias bloqueados sin conflictos", async () => {
    // No shifts on that date
    prismaMock.shift.findMany.mockResolvedValue([]);

    // createMany returns count
    prismaMock.blockDay.createMany.mockResolvedValue({ count: 1 });

    const req = createRequest(validPutPayload());
    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.created).toBe(1);
    expect(json.data.rescheduledShifts).toHaveLength(0);
  });

  // 2. Auto-reschedule conflicting shifts ---------------------------------

  it("reprograma turnos automaticamente al bloquear dias", async () => {
    const blockedDate = new Date(2026, 5, 10); // June 10, 2026 - Wednesday (day=3)

    // Two shifts on the blocked date
    prismaMock.shift.findMany.mockResolvedValue([
      {
        id: "shift-1",
        userId: "medic-1",
        start: new Date(2026, 5, 10, 9, 0),
        end: new Date(2026, 5, 10, 9, 30),
        status: "PENDING",
        patient: { id: "p1", firstName: "Juan", lastName: "Perez", dni: "111" },
      },
      {
        id: "shift-2",
        userId: "medic-1",
        start: new Date(2026, 5, 10, 10, 0),
        end: new Date(2026, 5, 10, 10, 30),
        status: "CONFIRMED",
        patient: { id: "p2", firstName: "Maria", lastName: "Lopez", dni: "222" },
      },
    ]);

    // Preferences: Wednesday (day=3) has AM hours 08:00-13:00
    // Also Thursday (day=4) so the helper can find a next day
    prismaMock.userPreference.findMany.mockResolvedValue([
      {
        id: "pref-3",
        userId: "medic-1",
        day: 3, // Wednesday
        fromHourAM: "08:00",
        toHourAM: "13:00",
        fromHourPM: null,
        toHourPM: null,
      },
      {
        id: "pref-4",
        userId: "medic-1",
        day: 4, // Thursday
        fromHourAM: "08:00",
        toHourAM: "13:00",
        fromHourPM: null,
        toHourPM: null,
      },
    ]);

    // No existing block days
    prismaMock.blockDay.findMany.mockResolvedValue([]);

    // No conflict at the new date
    prismaMock.shift.findFirst.mockResolvedValue(null);

    // shift.update resolves successfully
    prismaMock.shift.update.mockResolvedValue({});

    prismaMock.blockDay.createMany.mockResolvedValue({ count: 1 });

    const req = createRequest(validPutPayload());
    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.rescheduledShifts).toHaveLength(2);

    // Verify rescheduled data structure
    const first = json.data.rescheduledShifts[0];
    expect(first.shiftId).toBe("shift-1");
    expect(first.patient).toContain("Perez");
    expect(first.originalDate).toBeTruthy();
    expect(first.newDate).toBeTruthy();
    expect(first.originalTime).toBe("09:00");

    const second = json.data.rescheduledShifts[1];
    expect(second.shiftId).toBe("shift-2");
    expect(second.patient).toContain("Lopez");
    expect(second.originalTime).toBe("10:00");

    // shift.update should have been called twice
    expect(prismaMock.shift.update).toHaveBeenCalledTimes(2);
  });

  // 3. Ignores CANCELLED / FINISHED shifts --------------------------------

  it("no reprograma turnos CANCELLED o FINISHED", async () => {
    // The query filters by status notIn CANCELLED,FINISHED,
    // so findMany returns empty (those shifts are excluded by the where clause)
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.blockDay.createMany.mockResolvedValue({ count: 1 });

    const req = createRequest(validPutPayload());
    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.rescheduledShifts).toHaveLength(0);
    // shift.update should NOT be called
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
  });

  // 4. Auth ---------------------------------------------------------------

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const req = createRequest(validPutPayload());
    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  // 5. Validation ---------------------------------------------------------

  it("rechaza datos invalidos", async () => {
    // Missing required fields
    const req = createRequest({ userId: "", dates: [] });
    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Datos inv");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/preferences/block-days
// ---------------------------------------------------------------------------

describe("DELETE /api/preferences/block-days", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // 6. Happy path: delete existing block day ------------------------------

  it("elimina dia bloqueado existente", async () => {
    prismaMock.blockDay.findUnique.mockResolvedValue({
      id: "bd-1",
      userId: "medic-1",
      date: new Date(2026, 5, 10),
    });

    prismaMock.blockDay.delete.mockResolvedValue({
      id: "bd-1",
    });

    const req = createRequest({ id: "bd-1" }, "DELETE");
    const res = await DELETE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("bd-1");

    expect(prismaMock.blockDay.delete).toHaveBeenCalledWith({
      where: { id: "bd-1" },
    });
  });

  // 7. 404 when block day does not exist ----------------------------------

  it("retorna 404 si dia bloqueado no existe", async () => {
    prismaMock.blockDay.findUnique.mockResolvedValue(null);

    const req = createRequest({ id: "nonexistent" }, "DELETE");
    const res = await DELETE(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toContain("no encontrado");
  });
});
