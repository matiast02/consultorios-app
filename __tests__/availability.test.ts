// El proceso corre en UTC a propósito: la grilla tiene que salir en hora AR
// (UTC-3) sin depender del huso del servidor.
process.env.TZ = "UTC";

import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import {
  addDaysToKey,
  arDateKey,
  arTimeLabel,
  buildDaySlots,
  dayOfWeekOfKey,
  getAvailableSlots,
  isValidDateKey,
  loadRangeAvailability,
} from "@/lib/availability";

const HOURS_AM = { fromHourAM: "09:00", toHourAM: "11:00", fromHourPM: null, toHourPM: null };
const labels = (slots: Array<{ start: Date }>) => slots.map((s) => arTimeLabel(s.start));

describe("fechas en hora AR", () => {
  it("arDateKey / arTimeLabel usan UTC-3 fijo", () => {
    // 01:30Z del 6 = 22:30 AR del 5
    const d = new Date("2026-10-06T01:30:00Z");
    expect(arDateKey(d)).toBe("2026-10-05");
    expect(arTimeLabel(d)).toBe("22:30");
  });

  it("valida fechas reales y calcula el día de la semana (0=Domingo)", () => {
    expect(isValidDateKey("2026-02-31")).toBe(false);
    expect(isValidDateKey("2026-10-05")).toBe(true);
    expect(isValidDateKey("5/10/2026")).toBe(false);
    expect(dayOfWeekOfKey("2026-10-04")).toBe(0);
    expect(dayOfWeekOfKey("2026-10-05")).toBe(1);
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("buildDaySlots", () => {
  it("genera la grilla en hora AR", () => {
    const slots = buildDaySlots({ date: "2026-10-05", hours: HOURS_AM, durationMinutes: 30, busy: [] });
    expect(labels(slots)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(slots[0].start.toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it("buffer: paso = duración + buffer y los turnos ocupan ± buffer", () => {
    const slots = buildDaySlots({
      date: "2026-10-05",
      hours: { ...HOURS_AM, toHourAM: "12:00" },
      durationMinutes: 30,
      bufferMinutes: 10,
      // Turno 10:20–10:50 AR
      busy: [{ start: new Date("2026-10-05T13:20:00Z"), end: new Date("2026-10-05T13:50:00Z") }],
    });
    expect(labels(slots)).toEqual(["09:00", "09:40", "10:20", "11:00"]);
    expect(slots.map((s) => s.available)).toEqual([true, true, false, true]);
  });

  it("un turno que pisa el buffer también bloquea el hueco vecino", () => {
    const slots = buildDaySlots({
      date: "2026-10-05",
      hours: HOURS_AM,
      durationMinutes: 30,
      bufferMinutes: 10,
      // Sobreturno 10:15–10:30 AR: choca con 09:40–10:10 por el buffer
      busy: [{ start: new Date("2026-10-05T13:15:00Z"), end: new Date("2026-10-05T13:30:00Z") }],
    });
    expect(labels(slots.filter((s) => !s.available))).toEqual(["09:40", "10:20"]);
  });

  it("descarta los horarios que empiezan en o antes de notBefore", () => {
    const slots = buildDaySlots({
      date: "2026-10-05",
      hours: HOURS_AM,
      durationMinutes: 30,
      busy: [],
      notBefore: new Date("2026-10-05T12:30:00Z"), // 09:30 AR
    });
    expect(labels(slots)).toEqual(["10:00", "10:30"]);
  });

  it("ignora tramos mal configurados y duraciones inválidas", () => {
    expect(
      buildDaySlots({
        date: "2026-10-05",
        hours: { fromHourAM: "12:00", toHourAM: "09:00", fromHourPM: "xx", toHourPM: "18:00" },
        durationMinutes: 30,
        busy: [],
      }),
    ).toEqual([]);
    expect(buildDaySlots({ date: "2026-10-05", hours: HOURS_AM, durationMinutes: 0, busy: [] })).toEqual([]);
  });
});

describe("getAvailableSlots", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.userPreference.findUnique.mockResolvedValue({ userId: "medic-1", day: 1, ...HOURS_AM });
    prismaMock.blockDay.findFirst.mockResolvedValue(null);
    prismaMock.shift.findMany.mockResolvedValue([]);
  });

  it("aplica la anticipación mínima del médico y nunca devuelve horarios pasados", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ bufferMinutes: 0, minAdvanceMinutes: 30 });
    const now = new Date("2026-10-05T12:10:00Z"); // 09:10 AR → mínimo 09:40

    const slots = await getAvailableSlots({ medicId: "medic-1", date: "2026-10-05", durationMinutes: 30, now });
    expect(labels(slots)).toEqual(["10:00", "10:30"]);
  });

  it("usa la mayor anticipación entre la del médico y la pedida", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ bufferMinutes: 0, minAdvanceMinutes: 0 });
    const now = new Date("2026-10-05T11:00:00Z"); // 08:00 AR; +120 min → 10:00

    const slots = await getAvailableSlots({
      medicId: "medic-1",
      date: "2026-10-05",
      durationMinutes: 30,
      now,
      minAdvanceMinutes: 120,
    });
    expect(labels(slots)).toEqual(["10:30"]);
  });

  it("excluye huecos ocupados y consulta turnos no cancelados con el buffer", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ bufferMinutes: 0, minAdvanceMinutes: 0 });
    prismaMock.shift.findMany.mockResolvedValue([
      { start: new Date("2026-10-05T12:30:00Z"), end: new Date("2026-10-05T13:00:00Z") },
    ]);
    const now = new Date("2026-10-04T12:00:00Z");

    const slots = await getAvailableSlots({ medicId: "medic-1", date: "2026-10-05", durationMinutes: 30, now });
    expect(labels(slots)).toEqual(["09:00", "10:00", "10:30"]);
    const where = prismaMock.shift.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ notIn: ["CANCELLED"] });
    expect(where.userId).toBe("medic-1");
  });

  it("día bloqueado → sin huecos (busca el BlockDay por la fecha civil)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ bufferMinutes: 0, minAdvanceMinutes: 0 });
    prismaMock.blockDay.findFirst.mockResolvedValue({ id: "b-1" });

    const slots = await getAvailableSlots({
      medicId: "medic-1",
      date: "2026-10-05",
      durationMinutes: 30,
      now: new Date("2026-10-01T12:00:00Z"),
    });
    expect(slots).toEqual([]);
    expect(prismaMock.blockDay.findFirst.mock.calls[0][0].where.date).toEqual({
      gte: new Date("2026-10-05T00:00:00Z"),
      lt: new Date("2026-10-06T00:00:00Z"),
    });
  });

  it("médico inexistente o fecha inválida → []", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await getAvailableSlots({ medicId: "x", date: "2026-10-05", durationMinutes: 30 })).toEqual([]);
    expect(await getAvailableSlots({ medicId: "x", date: "2026-13-05", durationMinutes: 30 })).toEqual([]);
  });
});

describe("loadRangeAvailability", () => {
  beforeEach(() => resetAllMocks());

  it("marca días sin atención, bloqueados (guardados a 00:00Z o 03:00Z) y abiertos", async () => {
    prismaMock.userPreference.findMany.mockResolvedValue([
      { userId: "medic-1", day: 1, ...HOURS_AM },
      { userId: "medic-1", day: 2, ...HOURS_AM },
      { userId: "medic-1", day: 3, ...HOURS_AM },
    ]);
    prismaMock.blockDay.findMany.mockResolvedValue([
      { date: new Date("2026-10-06T00:00:00Z") }, // creado por la API
      { date: new Date("2026-10-07T03:00:00Z") }, // creado por el seed en un servidor AR
    ]);
    prismaMock.shift.findMany.mockResolvedValue([]);

    const days = await loadRangeAvailability({ medicId: "medic-1", from: "2026-10-04", days: 4, durationMinutes: 30 });
    expect(days.map((d) => [d.date, d.status])).toEqual([
      ["2026-10-04", "NOT_WORKING"],
      ["2026-10-05", "OPEN"],
      ["2026-10-06", "BLOCKED"],
      ["2026-10-07", "BLOCKED"],
    ]);
    expect(days[1].slots).toHaveLength(4);
  });
});
