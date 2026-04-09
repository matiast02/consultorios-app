process.env.TZ = "UTC";

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { isMedic } from "@/lib/auth-utils";
import { GET } from "@/app/api/notifications/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/notifications", {
    method: "GET",
  });
}

const isMedicMock = isMedic as unknown as ReturnType<typeof import("vitest").vi.fn>;

function mockTodayShifts(count: number) {
  const now = new Date();
  const shifts = Array.from({ length: count }, (_, i) => ({
    status: i === 0 ? "PENDING" : "CONFIRMED",
    start: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      9 + i,
      0,
      0
    ),
  }));

  // The route calls shift.findMany multiple times (for rescheduled shifts and today shifts).
  // We need to handle both calls: first for rescheduled (return []), second for today shifts.
  // However, since findMany is called in parallel via Promise.all, we mock per-call order.
  prismaMock.shift.findMany
    .mockResolvedValueOnce([]) // rescheduled shifts
    .mockResolvedValueOnce(shifts); // today shifts
}

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------

describe("GET /api/notifications", () => {
  beforeEach(() => {
    resetAllMocks();
    // Default: not a medic (secretary)
    isMedicMock.mockResolvedValue(false);
    // Default: no raw query results (inactive patients)
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("retorna notificaciones on-demand para medico", async () => {
    isMedicMock.mockResolvedValue(true);

    const now = new Date();
    const todayShifts = [
      { status: "PENDING", start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0) },
      { status: "CONFIRMED", start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0) },
    ];

    prismaMock.shift.findMany
      .mockResolvedValueOnce([]) // rescheduled shifts
      .mockResolvedValueOnce(todayShifts); // today shifts

    prismaMock.studyOrder.count.mockResolvedValue(3);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.notifications).toBeInstanceOf(Array);
    expect(json.data.notifications.length).toBeGreaterThan(0);
    expect(json.data.count).toBeGreaterThan(0);
  });

  it("retorna notificaciones para secretaria", async () => {
    isMedicMock.mockResolvedValue(false);

    // No shifts, no studies, no inactive patients
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.studyOrder.count.mockResolvedValue(0);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.notifications).toBeInstanceOf(Array);
  });

  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toContain("No autorizado");
  });

  it("incluye resumen del dia cuando hay turnos", async () => {
    isMedicMock.mockResolvedValue(true);
    mockTodayShifts(2);
    prismaMock.studyOrder.count.mockResolvedValue(0);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    const dailySummary = json.data.notifications.find(
      (n: { type: string }) => n.type === "daily_summary"
    );
    expect(dailySummary).toBeDefined();
    expect(dailySummary.title).toBe("Turnos de hoy");
    expect(dailySummary.message).toContain("2 turnos hoy");
  });

  it("incluye alerta de estudios pendientes", async () => {
    isMedicMock.mockResolvedValue(true);

    // No today shifts, no rescheduled
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.studyOrder.count.mockResolvedValue(5);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    const pendingStudies = json.data.notifications.find(
      (n: { type: string }) => n.type === "pending_studies"
    );
    expect(pendingStudies).toBeDefined();
    expect(pendingStudies.title).toBe("Estudios pendientes");
    expect(pendingStudies.message).toContain("5");
  });
});
