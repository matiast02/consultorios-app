// Force UTC so date math in the route is predictable
process.env.TZ = "UTC";

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { GET } from "@/app/api/users/[id]/available-slots/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(
  date?: string,
  duration?: number
): NextRequest {
  const url = new URL("http://localhost:3000/api/users/user-1/available-slots");
  if (date) url.searchParams.set("date", date);
  if (duration !== undefined) url.searchParams.set("duration", String(duration));
  return new NextRequest(url);
}

function routeParams(id = "user-1") {
  return { params: Promise.resolve({ id }) };
}

// 2026-04-13 is a Monday (dayOfWeek = 1)
const TEST_DATE = "2026-04-13";

function makePreference(overrides: Record<string, unknown> = {}) {
  return {
    id: "pref-1",
    userId: "user-1",
    day: 1, // Monday
    fromHourAM: "09:00",
    toHourAM: "12:00",
    fromHourPM: null,
    toHourPM: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/users/[id]/available-slots", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // 1 ─ Happy path: returns available slots for a working day
  it("retorna slots disponibles para dia laboral", async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue(makePreference());
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    prismaMock.shift.findMany.mockResolvedValue([]);

    const res = await GET(createRequest(TEST_DATE, 30), routeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const slots = body.data.slots;
    expect(slots.length).toBe(6);

    const startTimes = slots.map((s: { start: string }) => s.start);
    expect(startTimes).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);

    // All should be available
    expect(slots.every((s: { available: boolean }) => s.available)).toBe(true);
  });

  // 2 ─ Marks occupied slots as unavailable
  it("marca slots ocupados como no disponibles", async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue(makePreference());
    prismaMock.blockDay.findFirst.mockResolvedValue(null);

    // One existing shift at 10:00-10:30
    prismaMock.shift.findMany.mockResolvedValue([
      {
        start: new Date("2026-04-13T10:00:00.000Z"),
        end: new Date("2026-04-13T10:30:00.000Z"),
      },
    ]);

    const res = await GET(createRequest(TEST_DATE, 30), routeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const slots = body.data.slots;
    const slot1000 = slots.find(
      (s: { start: string }) => s.start === "10:00"
    );
    expect(slot1000).toBeDefined();
    expect(slot1000.available).toBe(false);

    // Other slots should remain available
    const slot0900 = slots.find(
      (s: { start: string }) => s.start === "09:00"
    );
    expect(slot0900.available).toBe(true);
  });

  // 3 ─ Returns empty for non-working day
  it("retorna vacio para dia no laboral", async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue(null);

    const res = await GET(createRequest(TEST_DATE, 30), routeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.slots).toEqual([]);
    expect(body.data.message).toContain("no atiende");
  });

  // 4 ─ Returns empty for blocked day
  it("retorna vacio para dia bloqueado", async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue(makePreference());
    prismaMock.blockDay.findFirst.mockResolvedValue({
      id: "block-1",
      userId: "user-1",
      date: new Date("2026-04-13T00:00:00.000Z"),
    });

    const res = await GET(createRequest(TEST_DATE, 30), routeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.slots).toEqual([]);
    expect(body.data.message).toContain("bloqueado");
  });

  // 5 ─ Rejects unauthenticated requests
  it("rechaza sin autenticacion", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await GET(createRequest(TEST_DATE, 30), routeParams());
    expect(res.status).toBe(401);
  });

  // 6 ─ Rejects missing date parameter
  it("rechaza sin parametro date", async () => {
    const res = await GET(createRequest(), routeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  // 7 ─ Calculates slots with custom duration
  it("calcula slots con duracion custom", async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue(
      makePreference({ fromHourAM: "09:00", toHourAM: "10:00" })
    );
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    prismaMock.shift.findMany.mockResolvedValue([]);

    const res = await GET(createRequest(TEST_DATE, 20), routeParams());
    const body = await res.json();

    expect(res.status).toBe(200);

    const slots = body.data.slots;
    expect(slots.length).toBe(3);

    const startTimes = slots.map((s: { start: string }) => s.start);
    expect(startTimes).toEqual(["09:00", "09:20", "09:40"]);

    expect(body.data.duration).toBe(20);
  });
});
