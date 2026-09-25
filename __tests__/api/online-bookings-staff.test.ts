process.env.TZ = "UTC";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { logAudit } from "@/lib/audit";
import { GET } from "@/app/api/online-bookings/route";
import { PATCH } from "@/app/api/online-bookings/[id]/route";
import { GET as secretaryDashboard } from "@/app/api/dashboard/secretary/route";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const TUE_10 = new Date("2026-10-06T13:00:00.000Z");

function listRequest(status?: string) {
  const url = new URL("http://localhost:3000/api/online-bookings");
  if (status) url.searchParams.set("status", status);
  return new NextRequest(url);
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/online-bookings/obr-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id = "obr-1") => ({ params: Promise.resolve({ id }) });

function staffRow(overrides: Record<string, unknown> = {}, shiftOverrides: Record<string, unknown> = {}) {
  return {
    id: "obr-1",
    shiftId: "shift-1",
    patientId: "patient-1",
    status: "PENDING_CONFIRMATION",
    createdAt: new Date("2026-10-04T15:00:00.000Z"),
    requesterFirstName: "Ana María",
    requesterLastName: "Pérez",
    requesterDni: "30123456",
    requesterPhone: "11 5555-5555",
    requesterEmail: "ana@example.com",
    healthInsuranceText: "OSDE",
    matchedExisting: false,
    shift: {
      start: TUE_10,
      status: "PENDING",
      user: { firstName: "Laura", lastName: "Gervilla", name: "Laura Gervilla", specialization: { color: "#0EA5E9" } },
      consultationType: { name: "Control" },
      ...shiftOverrides,
    },
    patient: { firstName: "Ana María", lastName: "Pérez", dni: "30123456" },
    ...overrides,
  };
}

function txRow(status = "PENDING_CONFIRMATION", shift: { status: string; start: Date } = { status: "PENDING", start: TUE_10 }) {
  return { id: "obr-1", status, shiftId: "shift-1", shift };
}

beforeEach(() => {
  resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── GET /api/online-bookings ────────────────────────────────────────────────

describe("GET /api/online-bookings", () => {
  it("401 sin sesión y 403 para médicos", async () => {
    authMock.mockResolvedValueOnce(null);
    expect((await GET(listRequest())).status).toBe(401);

    vi.mocked(isSecretaryOrAdmin).mockResolvedValueOnce(false);
    expect((await GET(listRequest())).status).toBe(403);
    expect(prismaMock.onlineBookingRequest.findMany).not.toHaveBeenCalled();
  });

  it("400 con un estado desconocido", async () => {
    expect((await GET(listRequest("WHATEVER"))).status).toBe(400);
  });

  it("lista pendientes (las más antiguas primero) con lo cargado y el aviso de verificación", async () => {
    prismaMock.onlineBookingRequest.findMany.mockResolvedValue([
      // DNI existente con otro nombre → mismatch
      staffRow({ matchedExisting: true, patient: { firstName: "Carlos", lastName: "Gómez", dni: "30123456" } }),
      // DNI existente, mismo nombre sin acentos/mayúsculas → ok
      staffRow({ id: "obr-2", matchedExisting: true, patient: { firstName: "ANA", lastName: "PEREZ", dni: "30123456" } }),
      // Alta nueva sin DNI (colisión con un archivado) → verificar
      staffRow({ id: "obr-3", patient: { firstName: "Ana María", lastName: "Pérez", dni: null } }),
      // Alta nueva normal
      staffRow({ id: "obr-4" }),
    ]);

    const res = await GET(listRequest("PENDING_CONFIRMATION"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.map((i: { patientDataMismatch: boolean }) => i.patientDataMismatch)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(json.data[0]).toEqual({
      id: "obr-1",
      shiftId: "shift-1",
      status: "PENDING_CONFIRMATION",
      createdAt: "2026-10-04T15:00:00.000Z",
      start: TUE_10.toISOString(),
      medicShortName: "Dra. Gervilla",
      medicColor: "#0EA5E9",
      consultationTypeName: "Control",
      requester: {
        firstName: "Ana María",
        lastName: "Pérez",
        dni: "30123456",
        phone: "11 5555-5555",
        email: "ana@example.com",
        healthInsuranceText: "OSDE",
      },
      patientId: "patient-1",
      matchedExisting: true,
      patientDataMismatch: true,
    });
    const args = prismaMock.onlineBookingRequest.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      status: "PENDING_CONFIRMATION",
      shift: { status: { not: "CANCELLED" }, start: { gt: NOW } },
    });
    expect(args.orderBy).toEqual({ createdAt: "asc" });
  });

  it("deriva el estado efectivo: turno cancelado → CANCELLED, turno ya empezado → EXPIRED", async () => {
    prismaMock.onlineBookingRequest.findMany.mockResolvedValue([
      staffRow({}, { status: "CANCELLED" }),
      staffRow({ id: "obr-2" }, { start: new Date(NOW.getTime() - 60_000) }),
    ]);
    const json = await (await GET(listRequest())).json();
    expect(json.data.map((i: { status: string }) => i.status)).toEqual(["CANCELLED", "EXPIRED"]);
  });
});

// ─── PATCH /api/online-bookings/[id] ─────────────────────────────────────────

describe("PATCH /api/online-bookings/[id]", () => {
  beforeEach(() => {
    prismaMock.shift.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.onlineBookingRequest.updateMany.mockResolvedValue({ count: 1 });
  });

  it("403 para médicos (solo recepción o admin)", async () => {
    vi.mocked(isSecretaryOrAdmin).mockResolvedValueOnce(false);
    const res = await PATCH(patchRequest({ action: "confirm" }), params());
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("400 con acción inválida", async () => {
    expect((await PATCH(patchRequest({ action: "approve" }), params())).status).toBe(400);
  });

  it("confirm → turno CONFIRMED (confirmedVia STAFF), request CONFIRMED y audit UPDATE shift", async () => {
    prismaMock.onlineBookingRequest.findUnique
      .mockResolvedValueOnce(txRow())
      .mockResolvedValueOnce(staffRow({ status: "CONFIRMED" }, { status: "CONFIRMED" }));

    const res = await PATCH(patchRequest({ action: "confirm" }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("CONFIRMED");
    expect(prismaMock.shift.updateMany).toHaveBeenCalledWith({
      where: { id: "shift-1", status: "PENDING", start: { gt: NOW } },
      data: { status: "CONFIRMED", confirmedAt: NOW, confirmedVia: "STAFF" },
    });
    expect(prismaMock.onlineBookingRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "obr-1", status: "PENDING_CONFIRMATION" },
      data: { status: "CONFIRMED", confirmedAt: NOW, confirmedById: "user-1" },
    });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({
      userId: "user-1",
      action: "UPDATE",
      resource: "shift",
      resourceId: "shift-1",
      details: { via: "online_booking", action: "confirm", requestId: "obr-1" },
    });
  });

  it("confirm con el turno ya confirmado por el paciente (link del recordatorio) no lo pisa", async () => {
    prismaMock.onlineBookingRequest.findUnique
      .mockResolvedValueOnce(txRow("PENDING_CONFIRMATION", { status: "CONFIRMED", start: TUE_10 }))
      .mockResolvedValueOnce(staffRow({ status: "CONFIRMED" }, { status: "CONFIRMED" }));

    const res = await PATCH(patchRequest({ action: "confirm" }), params());
    expect(res.status).toBe(200);
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.onlineBookingRequest.updateMany).toHaveBeenCalled();
  });

  it("409 si ya no está pendiente (confirmada, cancelada o vencida)", async () => {
    prismaMock.onlineBookingRequest.findUnique.mockResolvedValueOnce(txRow("CONFIRMED"));
    const confirmed = await PATCH(patchRequest({ action: "confirm" }), params());
    expect(confirmed.status).toBe(409);
    expect((await confirmed.json()).code).toBe("INVALID_STATE");

    prismaMock.onlineBookingRequest.findUnique.mockResolvedValueOnce(
      txRow("PENDING_CONFIRMATION", { status: "PENDING", start: new Date(NOW.getTime() - 60_000) }),
    );
    expect((await PATCH(patchRequest({ action: "reject" }), params())).status).toBe(409);

    prismaMock.onlineBookingRequest.findUnique.mockResolvedValueOnce(
      txRow("PENDING_CONFIRMATION", { status: "CANCELLED", start: TUE_10 }),
    );
    expect((await PATCH(patchRequest({ action: "confirm" }), params())).status).toBe(409);

    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("reject → turno CANCELLED, request CANCELLED por STAFF y recordatorios descartados", async () => {
    prismaMock.onlineBookingRequest.findUnique
      .mockResolvedValueOnce(txRow())
      .mockResolvedValueOnce(staffRow({ status: "CANCELLED" }, { status: "CANCELLED" }));

    const res = await PATCH(patchRequest({ action: "reject" }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("CANCELLED");
    expect(prismaMock.shift.updateMany).toHaveBeenCalledWith({
      where: { id: "shift-1", status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED" },
    });
    expect(prismaMock.onlineBookingRequest.updateMany.mock.calls[0][0].data).toEqual({
      status: "CANCELLED",
      cancelledAt: NOW,
      cancelledBy: "STAFF",
    });
    expect(prismaMock.shiftReminder.updateMany.mock.calls[0][0].where).toEqual({
      shiftId: "shift-1",
      status: "PENDING",
    });
    expect(vi.mocked(logAudit).mock.calls[0][0].details).toMatchObject({ action: "reject" });
  });

  it("404 con una reserva inexistente", async () => {
    const res = await PATCH(patchRequest({ action: "confirm" }), params("nope"));
    expect(res.status).toBe(404);
  });
});

// ─── Dashboard de recepción ──────────────────────────────────────────────────

describe("GET /api/dashboard/secretary → reservasOnline", () => {
  it("incluye el resumen de reservas online pendientes", async () => {
    prismaMock.onlineBookingRequest.count.mockResolvedValue(7);
    prismaMock.onlineBookingRequest.findMany.mockResolvedValue([staffRow()]);

    const res = await secretaryDashboard();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.reservasOnline.pending).toBe(7);
    expect(json.data.reservasOnline.items).toHaveLength(1);
    expect(prismaMock.onlineBookingRequest.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { createdAt: "asc" },
      take: 5,
    });
  });
});
