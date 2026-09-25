import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks, authMock } from "../setup";
import * as authUtils from "@/lib/auth-utils";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { POST as startConsultation } from "@/app/api/shifts/[id]/start-consultation/route";
import { POST as recall } from "@/app/api/shifts/[id]/recall/route";
import { PUT as updateShift } from "@/app/api/shifts/[id]/route";

// Llamado a consultorio (módulo waiting_room): pase a consulta con ticket,
// «volver a llamar», política de acceso (médico solo turnos propios) y cierre
// del número al cambiar el estado del turno.

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(body?: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function put(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/shifts/s1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function moduleOn() {
  prismaMock.moduleConfig.findUnique.mockResolvedValue({ module: "waiting_room", enabled: true });
}

const SHIFT = {
  id: "s1",
  userId: "medic-1",
  status: "CONFIRMED",
  arrivedAt: new Date("2026-09-25T11:00:00.000Z"),
  consultationStartedAt: null,
  user: { defaultRoom: "Consultorio 1" },
};

/** Ticket abierto sin llamar; update() devuelve lo que se escribió. */
function openTicket(callCount = 0) {
  prismaMock.waitingTicket.findUnique.mockResolvedValue({
    id: "t1",
    closedAt: null,
    calledAt: callCount > 0 ? new Date("2026-09-25T12:00:00.000Z") : null,
    callCount,
  });
  prismaMock.waitingTicket.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "t1",
    number: 4,
    date: "2026-09-25",
    room: "room" in data ? data.room : "Consultorio 1",
    calledAt: data.calledAt,
    lastCalledAt: data.lastCalledAt,
    callCount: data.callCount,
  }));
}

describe("POST /api/shifts/{id}/start-consultation", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.shift.findUnique.mockResolvedValue(SHIFT);
    prismaMock.shift.update.mockResolvedValue({ id: "s1", consultationStartedAt: new Date(), arrivedAt: SHIFT.arrivedAt });
  });

  it("recepción llama con el consultorio habitual del profesional y sella el ticket", async () => {
    moduleOn();
    openTicket();
    const res = await startConsultation(post({}), params("s1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ticket).toEqual(expect.objectContaining({ number: 4, room: "Consultorio 1", callCount: 1 }));
    expect(prismaMock.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consultationStartedAt: expect.any(Date), arrivedAt: SHIFT.arrivedAt } }),
    );
    expect(prismaMock.waitingTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ room: "Consultorio 1", callCount: 1, calledAt: expect.any(Date), lastCalledAt: expect.any(Date) }),
      }),
    );
  });

  it("el consultorio del cuerpo pisa el habitual; vacío deja sin consultorio", async () => {
    moduleOn();
    openTicket();
    await startConsultation(post({ room: "Sala B" }), params("s1"));
    expect(prismaMock.waitingTicket.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ room: "Sala B" }) }),
    );
    openTicket();
    await startConsultation(post({ room: "" }), params("s1"));
    expect(prismaMock.waitingTicket.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ room: null }) }),
    );
  });

  it("sin número de sala pasa a consulta igual (ticket null)", async () => {
    moduleOn();
    prismaMock.waitingTicket.findUnique.mockResolvedValue(null);
    const res = await startConsultation(post(), params("s1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ticket).toBeNull();
    expect(prismaMock.shift.update).toHaveBeenCalled();
    expect(prismaMock.waitingTicket.update).not.toHaveBeenCalled();
  });

  it("con el módulo apagado no toca tickets", async () => {
    const res = await startConsultation(post(), params("s1"));
    expect(res.status).toBe(200);
    expect(prismaMock.waitingTicket.findUnique).not.toHaveBeenCalled();
  });

  it("si no había llegada registrada, la setea ahora", async () => {
    prismaMock.shift.findUnique.mockResolvedValue({ ...SHIFT, arrivedAt: null });
    await startConsultation(post(), params("s1"));
    expect(prismaMock.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consultationStartedAt: expect.any(Date), arrivedAt: expect.any(Date) } }),
    );
  });

  it("el médico dueño del turno puede llamar", async () => {
    vi.mocked(authUtils.getUserRole).mockResolvedValue("medic");
    authMock.mockResolvedValue({ user: { id: "medic-1", email: "m@test.com", role: "medic" } });
    const res = await startConsultation(post(), params("s1"));
    expect(res.status).toBe(200);
  });

  it("otro médico recibe 404 (no revela el turno)", async () => {
    vi.mocked(authUtils.getUserRole).mockResolvedValue("medic");
    authMock.mockResolvedValue({ user: { id: "medic-2", email: "m2@test.com", role: "medic" } });
    const res = await startConsultation(post(), params("s1"));
    expect(res.status).toBe(404);
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
  });

  it("usuario sin rol → 403", async () => {
    vi.mocked(authUtils.getUserRole).mockResolvedValue(null);
    expect((await startConsultation(post(), params("s1"))).status).toBe(403);
  });

  it("turno cancelado → 409", async () => {
    prismaMock.shift.findUnique.mockResolvedValue({ ...SHIFT, status: "CANCELLED" });
    expect((await startConsultation(post(), params("s1"))).status).toBe(409);
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
  });

  it("consultorio demasiado largo → 400", async () => {
    expect((await startConsultation(post({ room: "x".repeat(41) }), params("s1"))).status).toBe(400);
  });
});

describe("POST /api/shifts/{id}/recall", () => {
  beforeEach(() => {
    resetAllMocks();
    prismaMock.shift.findUnique.mockResolvedValue({
      ...SHIFT,
      consultationStartedAt: new Date("2026-09-25T12:00:00.000Z"),
    });
  });

  it("módulo apagado → 404 sin tocar nada", async () => {
    const res = await recall(post(), params("s1"));
    expect(res.status).toBe(404);
    expect(prismaMock.shift.findUnique).not.toHaveBeenCalled();
  });

  it("paciente todavía no llamado → 409", async () => {
    moduleOn();
    prismaMock.shift.findUnique.mockResolvedValue({ ...SHIFT, consultationStartedAt: null });
    expect((await recall(post(), params("s1"))).status).toBe(409);
  });

  it("turno ya terminado → 409", async () => {
    moduleOn();
    prismaMock.shift.findUnique.mockResolvedValue({
      ...SHIFT,
      status: "FINISHED",
      consultationStartedAt: new Date(),
    });
    expect((await recall(post(), params("s1"))).status).toBe(409);
  });

  it("sin número de sala → 409", async () => {
    moduleOn();
    prismaMock.waitingTicket.findUnique.mockResolvedValue(null);
    const res = await recall(post(), params("s1"));
    expect(res.status).toBe(409);
  });

  it("incrementa callCount y conserva el consultorio si no se manda", async () => {
    moduleOn();
    openTicket(1);
    const res = await recall(post(), params("s1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ticket).toEqual(expect.objectContaining({ number: 4, callCount: 2, room: "Consultorio 1" }));
    const { data } = prismaMock.waitingTicket.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty("room");
  });

  it("puede cambiar el consultorio al volver a llamar", async () => {
    moduleOn();
    openTicket(1);
    await recall(post({ room: "Consultorio 3" }), params("s1"));
    expect(prismaMock.waitingTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ room: "Consultorio 3", callCount: 2 }) }),
    );
  });

  it("otro médico → 404", async () => {
    moduleOn();
    vi.mocked(authUtils.getUserRole).mockResolvedValue("medic");
    authMock.mockResolvedValue({ user: { id: "medic-2", email: "m2@test.com", role: "medic" } });
    expect((await recall(post(), params("s1"))).status).toBe(404);
  });
});

describe("PUT /api/shifts/{id} cierra el número de sala", () => {
  const existing = {
    id: "s1",
    userId: "user-1",
    patientId: "p1",
    status: "CONFIRMED",
    start: new Date("2026-09-25T11:00:00.000Z"),
    end: new Date("2026-09-25T11:30:00.000Z"),
  };

  beforeEach(() => {
    resetAllMocks();
    prismaMock.shift.findUnique.mockResolvedValue(existing);
    prismaMock.shift.update.mockResolvedValue({ ...existing, patient: null, user: null });
  });

  it("FINISHED → cierre ATTENDED", async () => {
    const res = await updateShift(put({ status: "FINISHED" }), params("s1"));
    expect(res.status).toBe(200);
    expect(prismaMock.waitingTicket.updateMany).toHaveBeenCalledWith({
      where: { shiftId: "s1", closedAt: null },
      data: { closedAt: expect.any(Date), closedReason: "ATTENDED" },
    });
  });

  it("ABSENT → cierre ABSENT; CANCELLED → VOID", async () => {
    await updateShift(put({ status: "ABSENT" }), params("s1"));
    expect(prismaMock.waitingTicket.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ closedReason: "ABSENT" }) }),
    );
    await updateShift(put({ status: "CANCELLED" }), params("s1"));
    expect(prismaMock.waitingTicket.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ closedReason: "VOID" }) }),
    );
  });

  it("sin cambio de estado no toca el número", async () => {
    await updateShift(put({ observations: "trae estudios" }), params("s1"));
    await updateShift(put({ status: "CONFIRMED" }), params("s1"));
    expect(prismaMock.waitingTicket.updateMany).not.toHaveBeenCalled();
  });

  it("un fallo al cerrar el número no rompe la actualización del turno", async () => {
    prismaMock.waitingTicket.updateMany.mockRejectedValue(new Error("db"));
    const res = await updateShift(put({ status: "FINISHED" }), params("s1"));
    expect(res.status).toBe(200);
  });
});
