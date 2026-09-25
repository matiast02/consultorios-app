import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GET as getShift } from "@/app/api/shifts/[id]/route";

// `GET /api/shifts/{id}` expone el número de sala abierto como `ticket` (la ficha
// del paciente lo usa para la barra «Consulta en curso» del médico). Con el
// módulo apagado o el número cerrado es null, y la relación cruda nunca se filtra.

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new NextRequest(`http://localhost/api/shifts/${id}`, { method: "GET" });

const OPEN_TICKET = {
  id: "t1",
  number: 6,
  date: "2026-09-25",
  room: "Consultorio 2",
  calledAt: new Date("2026-09-25T14:05:00.000Z"),
  lastCalledAt: new Date("2026-09-25T14:07:00.000Z"),
  callCount: 2,
  closedAt: null,
};

const SHIFT = {
  id: "s1",
  userId: "medic-1",
  patientId: "p1",
  start: new Date("2026-09-25T14:00:00.000Z"),
  end: new Date("2026-09-25T14:30:00.000Z"),
  status: "CONFIRMED",
  patient: { id: "p1", firstName: "Bruno", lastName: "Acosta" },
  consultationType: null,
  user: { id: "medic-1", defaultRoom: "Consultorio 2" },
  coverageInsurance: null,
};

function moduleOn() {
  prismaMock.moduleConfig.findUnique.mockResolvedValue({ module: "waiting_room", enabled: true });
}

describe("GET /api/shifts/{id} — ticket de sala", () => {
  beforeEach(() => resetAllMocks());

  it("módulo activo y número abierto → `ticket` con consultorio y llamados", async () => {
    moduleOn();
    prismaMock.shift.findUnique.mockResolvedValue({ ...SHIFT, waitingTicket: OPEN_TICKET });
    const res = await getShift(req("s1"), ctx("s1"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.ticket).toEqual({
      id: "t1",
      number: 6,
      date: "2026-09-25",
      room: "Consultorio 2",
      calledAt: OPEN_TICKET.calledAt.toISOString(),
      lastCalledAt: OPEN_TICKET.lastCalledAt.toISOString(),
      callCount: 2,
    });
    expect(json.data).not.toHaveProperty("waitingTicket");
    // Se pide la relación con lo justo (incluye closedAt para decidir si sigue abierto).
    const include = prismaMock.shift.findUnique.mock.calls[0][0].include;
    expect(include.waitingTicket.select).toEqual(expect.objectContaining({ number: true, room: true, closedAt: true }));
  });

  it("número todavía sin llamar → `ticket` con calledAt null", async () => {
    moduleOn();
    prismaMock.shift.findUnique.mockResolvedValue({
      ...SHIFT,
      waitingTicket: { ...OPEN_TICKET, room: null, calledAt: null, lastCalledAt: null, callCount: 0 },
    });
    const json = await (await getShift(req("s1"), ctx("s1"))).json();
    expect(json.data.ticket).toEqual(expect.objectContaining({ number: 6, room: null, calledAt: null, callCount: 0 }));
  });

  it("número cerrado (atendido) → null", async () => {
    moduleOn();
    prismaMock.shift.findUnique.mockResolvedValue({
      ...SHIFT,
      waitingTicket: { ...OPEN_TICKET, closedAt: new Date("2026-09-25T14:40:00.000Z") },
    });
    const json = await (await getShift(req("s1"), ctx("s1"))).json();
    expect(json.data.ticket).toBeNull();
  });

  it("módulo apagado → null aunque quede un ticket abierto, y no consulta el módulo si no hay ticket", async () => {
    prismaMock.shift.findUnique.mockResolvedValue({ ...SHIFT, waitingTicket: OPEN_TICKET });
    const json = await (await getShift(req("s1"), ctx("s1"))).json();
    expect(json.data.ticket).toBeNull();

    resetAllMocks();
    prismaMock.shift.findUnique.mockResolvedValue({ ...SHIFT, waitingTicket: null });
    const json2 = await (await getShift(req("s1"), ctx("s1"))).json();
    expect(json2.data.ticket).toBeNull();
    expect(prismaMock.moduleConfig.findUnique).not.toHaveBeenCalled();
  });
});
