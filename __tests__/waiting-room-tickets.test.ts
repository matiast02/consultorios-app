import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import {
  callTicketForShift,
  closeTicketForShift,
  ensureTicketForShift,
  ensureTicketForWalkIn,
  issueTicket,
  moveTicketToShift,
  openTicketsByTarget,
} from "@/lib/waiting-room/tickets";
import { formatTicketNumber } from "@/lib/waiting-room/format";
import { clinicDateKey, clinicToday } from "@/lib/clinic-time";

// El servicio acepta PrismaClient o TransactionClient; el mock cumple con ambos.
const db = prismaMock as never;

function p2002(): Error {
  const e = new Error("Unique constraint failed") as Error & { code: string };
  e.code = "P2002";
  return e;
}

/** create() devuelve lo que se le pidió crear (como Prisma). */
function echoCreate() {
  prismaMock.waitingTicket.create.mockImplementation(
    async ({ data }: { data: { number: number; date: string } }) => ({ id: "t-new", number: data.number, date: data.date }),
  );
}

describe("lib/clinic-time", () => {
  it("el día es el del consultorio (Buenos Aires), no el del servidor", () => {
    // 01:30 UTC del 25 son las 22:30 del 24 en Argentina (UTC-3, sin DST).
    expect(clinicDateKey(new Date("2026-09-25T01:30:00.000Z"))).toBe("2026-09-24");
    expect(clinicDateKey(new Date("2026-09-25T03:00:00.000Z"))).toBe("2026-09-25");
    expect(clinicToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formatea el número con dos dígitos", () => {
    expect(formatTicketNumber(7)).toBe("07");
    expect(formatTicketNumber(42)).toBe("42");
    expect(formatTicketNumber(123)).toBe("123");
  });
});

describe("issueTicket", () => {
  beforeEach(() => {
    resetAllMocks();
    echoCreate();
  });

  it("arranca en 1 el primer número del día", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ max: null }]);
    const t = await issueTicket(db, { shiftId: "s1", medicId: "m1" });
    expect(t.number).toBe(1);
    expect(t.date).toBe(clinicToday());
    expect(prismaMock.waitingTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ number: 1, shiftId: "s1", walkInId: null, medicId: "m1" }),
      }),
    );
  });

  it("sigue al máximo del día (MAX() llega como BigInt desde MySQL)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ max: 6n }]);
    const t = await issueTicket(db, { walkInId: "w1" });
    expect(t.number).toBe(7);
  });

  it("lee el máximo con FOR UPDATE para serializar a los emisores", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ max: 2 }]);
    await issueTicket(db, { walkInId: "w1" });
    const [strings] = prismaMock.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join("?")).toMatch(/SELECT MAX\(`number`\).*WHERE `date` = \?.*FOR UPDATE/s);
  });

  it("si otro emitió el mismo número (P2002) relee el máximo y reintenta", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ max: 6 }]).mockResolvedValueOnce([{ max: 7 }]);
    prismaMock.waitingTicket.create
      .mockRejectedValueOnce(p2002())
      .mockImplementationOnce(async ({ data }: { data: { number: number; date: string } }) => ({
        id: "t-new",
        number: data.number,
        date: data.date,
      }));
    const t = await issueTicket(db, { walkInId: "w1" });
    expect(t.number).toBe(8);
    expect(prismaMock.waitingTicket.create).toHaveBeenCalledTimes(2);
  });

  it("se rinde tras tres colisiones seguidas", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ max: 1 }]);
    prismaMock.waitingTicket.create.mockRejectedValue(p2002());
    await expect(issueTicket(db, { walkInId: "w1" })).rejects.toThrow();
    expect(prismaMock.waitingTicket.create).toHaveBeenCalledTimes(3);
  });

  it("otros errores no se reintentan", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ max: 1 }]);
    prismaMock.waitingTicket.create.mockRejectedValue(new Error("db down"));
    await expect(issueTicket(db, { walkInId: "w1" })).rejects.toThrow("db down");
    expect(prismaMock.waitingTicket.create).toHaveBeenCalledTimes(1);
  });
});

describe("ensureTicketForShift / ensureTicketForWalkIn", () => {
  beforeEach(() => {
    resetAllMocks();
    echoCreate();
    prismaMock.$queryRaw.mockResolvedValue([{ max: 3 }]);
  });

  it("emite uno nuevo si el turno no tenía", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue(null);
    const t = await ensureTicketForShift(db, { shiftId: "s1", medicId: "m1" });
    expect(t.number).toBe(4);
    expect(prismaMock.waitingTicket.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shiftId: "s1" } }),
    );
  });

  it("repetir la llegada devuelve el mismo número sin tocar nada", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue({
      id: "t1",
      number: 2,
      date: clinicToday(),
      closedAt: null,
    });
    const t = await ensureTicketForShift(db, { shiftId: "s1", medicId: "m1" });
    expect(t).toEqual({ id: "t1", number: 2, date: clinicToday() });
    expect(prismaMock.waitingTicket.create).not.toHaveBeenCalled();
    expect(prismaMock.waitingTicket.update).not.toHaveBeenCalled();
  });

  it("deshacer y volver a registrar la llegada reabre el ticket con el mismo número", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue({
      id: "t1",
      number: 2,
      date: clinicToday(),
      closedAt: new Date(),
    });
    prismaMock.waitingTicket.update.mockResolvedValue({ id: "t1", number: 2, date: clinicToday() });
    const t = await ensureTicketForShift(db, { shiftId: "s1", medicId: "m1" });
    expect(t.number).toBe(2);
    expect(prismaMock.waitingTicket.create).not.toHaveBeenCalled();
    expect(prismaMock.waitingTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({ closedAt: null, closedReason: null }),
      }),
    );
  });

  it("un ticket de otro día se renumera para hoy (misma fila, número nuevo)", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue({
      id: "t-old",
      number: 9,
      date: "2020-01-01",
      closedAt: new Date(),
    });
    prismaMock.waitingTicket.update.mockImplementation(
      async ({ data }: { data: { number: number; date: string } }) => ({ id: "t-old", number: data.number, date: data.date }),
    );
    const t = await ensureTicketForShift(db, { shiftId: "s1", medicId: "m1" });
    expect(t).toEqual({ id: "t-old", number: 4, date: clinicToday() });
    expect(prismaMock.waitingTicket.create).not.toHaveBeenCalled();
    expect(prismaMock.waitingTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-old" },
        data: expect.objectContaining({ date: clinicToday(), number: 4, closedAt: null, callCount: 0 }),
      }),
    );
  });

  it("el walk-in se busca por walkInId y no lleva médico", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue(null);
    await ensureTicketForWalkIn(db, { walkInId: "w1" });
    expect(prismaMock.waitingTicket.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walkInId: "w1" } }),
    );
    expect(prismaMock.waitingTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ walkInId: "w1", shiftId: null, medicId: null }) }),
    );
  });
});

describe("cierre y traslado", () => {
  beforeEach(() => resetAllMocks());

  it("closeTicketForShift cierra solo el abierto y guarda el motivo", async () => {
    await closeTicketForShift(db, "s1", "ABSENT");
    expect(prismaMock.waitingTicket.updateMany).toHaveBeenCalledWith({
      where: { shiftId: "s1", closedAt: null },
      data: { closedAt: expect.any(Date), closedReason: "ABSENT" },
    });
  });

  it("moveTicketToShift pasa el número del walk-in al turno con su médico", async () => {
    prismaMock.waitingTicket.findUnique
      .mockResolvedValueOnce({ id: "t1", number: 5, date: clinicToday(), closedAt: null }) // por walkInId
      .mockResolvedValueOnce(null); // el turno no tenía número
    prismaMock.shift.findUnique.mockResolvedValue({ userId: "m1" });
    prismaMock.waitingTicket.update.mockResolvedValue({ id: "t1", number: 5, date: clinicToday() });
    const t = await moveTicketToShift(db, { walkInId: "w1", shiftId: "s9" });
    expect(t?.number).toBe(5);
    expect(prismaMock.waitingTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: { shiftId: "s9", medicId: "m1" } }),
    );
  });

  it("si el turno ya tenía número, el del walk-in se anula", async () => {
    prismaMock.waitingTicket.findUnique
      .mockResolvedValueOnce({ id: "t1", number: 5, date: clinicToday(), closedAt: null })
      .mockResolvedValueOnce({ id: "t-shift" });
    const t = await moveTicketToShift(db, { walkInId: "w1", shiftId: "s9" });
    expect(t).toBeNull();
    expect(prismaMock.waitingTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: expect.objectContaining({ closedReason: "VOID" }) }),
    );
  });

  it("sin ticket abierto no hace nada", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue(null);
    expect(await moveTicketToShift(db, { walkInId: "w1", shiftId: "s9" })).toBeNull();
    expect(prismaMock.waitingTicket.update).not.toHaveBeenCalled();
  });
});

describe("openTicketsByTarget", () => {
  beforeEach(() => resetAllMocks());

  it("indexa los abiertos de hoy por turno y por walk-in", async () => {
    const base = { room: null, calledAt: null, lastCalledAt: null, callCount: 0 };
    prismaMock.waitingTicket.findMany.mockResolvedValue([
      { ...base, number: 1, shiftId: "s1", walkInId: null, room: "C1", callCount: 2 },
      { ...base, number: 2, shiftId: null, walkInId: "w1" },
      { ...base, number: 3, shiftId: "s3", walkInId: "w3" }, // walk-in que ya tiene turno
    ]);
    const { byShift, byWalkIn } = await openTicketsByTarget();
    expect(prismaMock.waitingTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { date: clinicToday(), closedAt: null } }),
    );
    expect(byShift.get("s1")).toEqual({ number: 1, room: "C1", calledAt: null, lastCalledAt: null, callCount: 2 });
    expect(byShift.get("s3")?.number).toBe(3);
    expect(byWalkIn.get("w1")?.number).toBe(2);
    expect(byWalkIn.get("w3")?.number).toBe(3);
  });
});

describe("callTicketForShift", () => {
  beforeEach(() => resetAllMocks());

  it("primer llamado: calledAt y lastCalledAt = ahora, callCount 1, consultorio del pedido", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue({ id: "t1", closedAt: null, calledAt: null, callCount: 0 });
    prismaMock.waitingTicket.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "t1",
      number: 4,
      date: clinicToday(),
      room: data.room ?? null,
      calledAt: data.calledAt,
      lastCalledAt: data.lastCalledAt,
      callCount: data.callCount,
    }));
    const t = await callTicketForShift(db, { shiftId: "s1", room: "Consultorio 2" });
    expect(t).toEqual(expect.objectContaining({ number: 4, room: "Consultorio 2", callCount: 1 }));
    expect(t?.calledAt).toBeInstanceOf(Date);
    expect(t?.lastCalledAt).toEqual(t?.calledAt);
  });

  it("volver a llamar conserva calledAt y el consultorio si no se manda", async () => {
    const first = new Date("2026-09-25T12:00:00.000Z");
    prismaMock.waitingTicket.findUnique.mockResolvedValue({ id: "t1", closedAt: null, calledAt: first, callCount: 1 });
    prismaMock.waitingTicket.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "t1",
      number: 4,
      date: clinicToday(),
      room: "C1",
      calledAt: data.calledAt,
      lastCalledAt: data.lastCalledAt,
      callCount: data.callCount,
    }));
    const t = await callTicketForShift(db, { shiftId: "s1" });
    expect(t?.callCount).toBe(2);
    expect(t?.calledAt).toEqual(first);
    const { data } = prismaMock.waitingTicket.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty("room");
  });

  it("sin ticket abierto devuelve null y no escribe", async () => {
    prismaMock.waitingTicket.findUnique.mockResolvedValue({ id: "t1", closedAt: new Date(), calledAt: null, callCount: 0 });
    expect(await callTicketForShift(db, { shiftId: "s1", room: null })).toBeNull();
    prismaMock.waitingTicket.findUnique.mockResolvedValue(null);
    expect(await callTicketForShift(db, { shiftId: "s1", room: null })).toBeNull();
    expect(prismaMock.waitingTicket.update).not.toHaveBeenCalled();
  });
});
