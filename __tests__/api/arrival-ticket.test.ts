import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock, resetAllMocks } from "../setup";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { POST as arrive, DELETE as undoArrival } from "@/app/api/shifts/[id]/arrival/route";
import { POST as createWalkIn } from "@/app/api/walk-ins/route";
import { PATCH as patchWalkIn, DELETE as deleteWalkIn } from "@/app/api/walk-ins/[id]/route";
import { clinicToday } from "@/lib/clinic-time";

// Llegadas con el módulo `waiting_room` apagado (comportamiento previo) y
// activo (emiten número de sala). El módulo se resuelve por ModuleConfig.

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function req(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function moduleOn() {
  prismaMock.moduleConfig.findUnique.mockResolvedValue({ module: "waiting_room", enabled: true });
}

function echoCreate() {
  prismaMock.waitingTicket.create.mockImplementation(
    async ({ data }: { data: { number: number; date: string } }) => ({ id: "t1", number: data.number, date: data.date }),
  );
}

describe("POST /api/shifts/{id}/arrival", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.shift.findUnique.mockResolvedValue({ id: "s1", userId: "m1" });
    prismaMock.shift.update.mockResolvedValue({ id: "s1", arrivedAt: new Date(), status: "CONFIRMED" });
    echoCreate();
  });

  it("con el módulo apagado registra la llegada sin número (ticket null)", async () => {
    const res = await arrive(req("POST"), params("s1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ticket).toBeNull();
    expect(prismaMock.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: { arrivedAt: expect.any(Date) } }),
    );
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.waitingTicket.create).not.toHaveBeenCalled();
  });

  it("con el módulo activo emite el número del día para el médico del turno", async () => {
    moduleOn();
    prismaMock.$queryRaw.mockResolvedValue([{ max: 3 }]);
    const res = await arrive(req("POST"), params("s1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ticket).toEqual({ id: "t1", number: 4, date: clinicToday() });
    expect(prismaMock.waitingTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shiftId: "s1", medicId: "m1" }) }),
    );
  });

  it("409 si el turno está cancelado (no entra en sala ni consume número)", async () => {
    moduleOn();
    prismaMock.shift.findUnique.mockResolvedValue({ id: "s1", userId: "m1", status: "CANCELLED" });
    const res = await arrive(req("POST"), params("s1"));
    expect(res.status).toBe(409);
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
    expect(prismaMock.waitingTicket.create).not.toHaveBeenCalled();
  });

  it("404 si el turno no existe (no emite número)", async () => {
    moduleOn();
    prismaMock.shift.findUnique.mockResolvedValue(null);
    const res = await arrive(req("POST"), params("nope"));
    expect(res.status).toBe(404);
    expect(prismaMock.waitingTicket.create).not.toHaveBeenCalled();
  });

  it("403 para quien no es recepción", async () => {
    const authUtils = await import("@/lib/auth-utils");
    vi.mocked(authUtils.isSecretaryOrAdmin).mockResolvedValue(false);
    const res = await arrive(req("POST"), params("s1"));
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/shifts/{id}/arrival", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.shift.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.shift.update.mockResolvedValue({ id: "s1", arrivedAt: null });
  });

  it("deshace la llegada y anula el número (VOID) sin reutilizarlo", async () => {
    const res = await undoArrival(req("DELETE"), params("s1"));
    expect(res.status).toBe(200);
    expect(prismaMock.waitingTicket.updateMany).toHaveBeenCalledWith({
      where: { shiftId: "s1", closedAt: null },
      data: { closedAt: expect.any(Date), closedReason: "VOID" },
    });
  });
});

describe("POST /api/walk-ins", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.walkInArrival.create.mockResolvedValue({
      id: "w1",
      patientId: null,
      firstName: "Antonia",
      lastName: "Díaz",
      telephone: null,
      note: null,
      arrivedAt: new Date(),
      leftAt: null,
      assignedShiftId: null,
    });
    echoCreate();
  });

  it("con el módulo activo devuelve el walk-in con su número", async () => {
    moduleOn();
    prismaMock.$queryRaw.mockResolvedValue([{ max: null }]);
    const res = await createWalkIn(req("POST", { firstName: "Antonia", lastName: "Díaz" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.id).toBe("w1");
    expect(json.data.ticket).toEqual({ id: "t1", number: 1, date: clinicToday() });
    expect(prismaMock.waitingTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ walkInId: "w1", shiftId: null, medicId: null }) }),
    );
  });

  it("con el módulo apagado no emite número", async () => {
    const res = await createWalkIn(req("POST", { firstName: "Antonia", lastName: "Díaz" }));
    const json = await res.json();
    expect(json.data.ticket).toBeNull();
    expect(prismaMock.waitingTicket.create).not.toHaveBeenCalled();
  });

  it("sigue exigiendo nombre y apellido", async () => {
    const res = await createWalkIn(req("POST", { firstName: "Antonia" }));
    expect(res.status).toBe(400);
    expect(prismaMock.walkInArrival.create).not.toHaveBeenCalled();
  });
});

describe("PATCH / DELETE /api/walk-ins/{id}", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.walkInArrival.findUnique.mockResolvedValue({ id: "w1", arrivedAt: new Date("2026-09-25T12:00:00.000Z") });
    prismaMock.walkInArrival.update.mockResolvedValue({ id: "w1", leftAt: new Date() });
  });

  it("«Retiró» cierra el número con motivo LEFT", async () => {
    const res = await patchWalkIn(req("PATCH", { markLeftNow: true }), params("w1"));
    expect(res.status).toBe(200);
    expect(prismaMock.waitingTicket.updateMany).toHaveBeenCalledWith({
      where: { walkInId: "w1", closedAt: null },
      data: { closedAt: expect.any(Date), closedReason: "LEFT" },
    });
  });

  it("asignar un turno traslada el número al turno", async () => {
    prismaMock.waitingTicket.findUnique
      .mockResolvedValueOnce({ id: "t1", number: 5, date: clinicToday(), closedAt: null })
      .mockResolvedValueOnce(null);
    prismaMock.shift.findUnique.mockResolvedValue({ userId: "m1" });
    const res = await patchWalkIn(req("PATCH", { assignedShiftId: "s9" }), params("w1"));
    expect(res.status).toBe(200);
    expect(prismaMock.waitingTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: { shiftId: "s9", medicId: "m1" } }),
    );
    // y el turno hereda la llegada del walk-in (solo si no la tenía)
    expect(prismaMock.shift.updateMany).toHaveBeenCalledWith({
      where: { id: "s9", arrivedAt: null },
      data: { arrivedAt: new Date("2026-09-25T12:00:00.000Z") },
    });
  });

  it("cambiar solo la nota no toca el número", async () => {
    await patchWalkIn(req("PATCH", { note: "vuelve mañana" }), params("w1"));
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
    await patchWalkIn(req("PATCH", { note: "vuelve mañana" }), params("w1"));
    expect(prismaMock.waitingTicket.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.waitingTicket.update).not.toHaveBeenCalled();
  });

  it("id inexistente → 404 (antes caía en 500)", async () => {
    prismaMock.walkInArrival.findUnique.mockResolvedValue(null);
    expect((await patchWalkIn(req("PATCH", { note: "x" }), params("nope"))).status).toBe(404);
    expect((await deleteWalkIn(req("DELETE"), params("nope"))).status).toBe(404);
    expect(prismaMock.walkInArrival.update).not.toHaveBeenCalled();
    expect(prismaMock.walkInArrival.delete).not.toHaveBeenCalled();
  });

  it("borrar la llegada anula el número antes de eliminarla", async () => {
    const res = await deleteWalkIn(req("DELETE"), params("w1"));
    expect(res.status).toBe(200);
    expect(prismaMock.waitingTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walkInId: "w1", closedAt: null }, data: expect.objectContaining({ closedReason: "VOID" }) }),
    );
    expect(prismaMock.walkInArrival.delete).toHaveBeenCalledWith({ where: { id: "w1" } });
  });
});
