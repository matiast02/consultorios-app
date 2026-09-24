import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { hashConfirmationToken } from "@/lib/reminders/tokens";
import { GET, POST } from "@/app/api/public/turno/[token]/route";

const HOUR = 60 * 60 * 1000;
const TOKEN = "tok_valid_abcdefghijklmnopqrstuv";

const params = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

function getRequest(token = TOKEN): NextRequest {
  return new NextRequest(`http://localhost:3000/api/public/turno/${token}`, {
    method: "GET",
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
}

function postRequest(body: unknown, token = TOKEN): NextRequest {
  return new NextRequest(`http://localhost:3000/api/public/turno/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(body),
  });
}

function tokenReminder(shiftOverrides: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 20 * HOUR);
  return {
    id: "rem-1",
    tokenExpiresAt: start,
    response: null,
    respondedAt: null,
    shift: {
      id: "shift-1",
      start,
      status: "PENDING",
      userId: "medic-1",
      patientId: "patient-1",
      patient: { firstName: "Ana María", lastName: "Pérez", reminderOptOut: false, deletedAt: null },
      user: { firstName: "Laura", lastName: "Gervilla", name: "Laura Gervilla" },
      reminders: [{ response: null, respondedAt: null }],
      ...shiftOverrides,
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetAllMocks();
  prismaMock.clinicSettings.findUnique.mockResolvedValue({
    name: "Consultorio Central",
    addressLine1: "Av. Siempreviva 742",
    addressLine2: null,
    remindersEnabled: true,
    reminderHoursBefore: 24,
    reminderSecondHoursBefore: null,
    reminderChannels: '["EMAIL","WHATSAPP"]',
    reminderTemplate: null,
  });
});

describe("GET /api/public/turno/[token]", () => {
  it("404 genérico con token inexistente", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(null);

    const res = await GET(getRequest(), params());
    expect(res.status).toBe(404);
    expect(prismaMock.shiftReminder.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashConfirmationToken(TOKEN) } }),
    );
  });

  it("404 sin consultar la base con un token malformado", async () => {
    const res = await GET(getRequest("x"), params("x"));
    expect(res.status).toBe(404);
    expect(prismaMock.shiftReminder.findUnique).not.toHaveBeenCalled();
  });

  it("404 con token vencido (misma respuesta que inexistente)", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(
      tokenReminder({}, { tokenExpiresAt: new Date(Date.now() - 1000) }),
    );

    const res = await GET(getRequest(), params());
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toBe("El link no es válido o ya venció");
  });

  it("devuelve datos mínimos del turno, sin nada clínico", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(tokenReminder());

    const res = await GET(getRequest(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json.data).toEqual({
      clinicName: "Consultorio Central",
      patientFirstName: "Ana",
      start: expect.any(String),
      medicShortName: "Dra. Gervilla",
      address: "Av. Siempreviva 742",
      status: "PENDING",
      canRespond: true,
      response: null,
    });
    // El select no pide observaciones ni tipo de consulta
    const select = prismaMock.shiftReminder.findUnique.mock.calls[0][0].select;
    expect(select.shift.select.observations).toBeUndefined();
    expect(select.shift.select.consultationType).toBeUndefined();
  });

  it("429 cuando se supera el rate limit por IP", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue({
      key: "public-turno:203.0.113.7",
      count: 20,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.rateLimit.update.mockResolvedValue({ count: 21 });

    const res = await GET(getRequest(), params());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(prismaMock.shiftReminder.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/public/turno/[token]", () => {
  it("404 con token inválido", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ action: "confirm" }), params());
    expect(res.status).toBe(404);
  });

  it("400 con acción inválida", async () => {
    const res = await POST(postRequest({ action: "borrar" }), params());
    expect(res.status).toBe(400);
  });

  it("confirm → Shift CONFIRMED vía PATIENT_LINK y respuesta en el recordatorio", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(tokenReminder());
    prismaMock.shift.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(postRequest({ action: "confirm" }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ status: "CONFIRMED", response: "CONFIRMED", canRespond: true });

    const shiftCall = prismaMock.shift.updateMany.mock.calls[0][0];
    expect(shiftCall.where).toMatchObject({ id: "shift-1", status: { in: ["PENDING", "CONFIRMED"] } });
    expect(shiftCall.data).toMatchObject({ status: "CONFIRMED", confirmedVia: "PATIENT_LINK" });
    expect(shiftCall.data.confirmedAt).toBeInstanceOf(Date);

    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { response: "CONFIRMED", respondedAt: expect.any(Date) },
    });
  });

  it("confirm deja registro de auditoría sin usuario", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(tokenReminder());
    prismaMock.shift.updateMany.mockResolvedValue({ count: 1 });

    await POST(postRequest({ action: "confirm" }), params());
    await new Promise((r) => setTimeout(r, 0)); // logAudit es fire-and-forget

    const audit = prismaMock.auditLog.create.mock.calls[0]?.[0];
    expect(audit.data).toMatchObject({ userId: null, action: "UPDATE", resource: "shift", resourceId: "shift-1" });
    expect(JSON.parse(audit.data.details)).toEqual({ via: "patient_link", action: "confirm" });
  });

  it("cancel → Shift CANCELLED y descarta los recordatorios pendientes", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(tokenReminder());
    prismaMock.shift.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(postRequest({ action: "cancel" }), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ status: "CANCELLED", response: "CANCELLED", canRespond: false });
    expect(prismaMock.shift.updateMany.mock.calls[0][0].data).toEqual({ status: "CANCELLED" });
    expect(prismaMock.shiftReminder.updateMany).toHaveBeenCalledWith({
      where: { shiftId: "shift-1", status: "PENDING" },
      data: { status: "FAILED", errorMessage: "Turno cancelado por el paciente" },
    });
  });

  it("409 cuando el turno ya empezó", async () => {
    // Token todavía vigente (p.ej. turno adelantado) pero el turno ya empezó
    prismaMock.shiftReminder.findUnique.mockResolvedValue(
      tokenReminder({ start: new Date(Date.now() - 10 * 60 * 1000) }),
    );

    const res = await POST(postRequest({ action: "confirm" }), params());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.data.canRespond).toBe(false);
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
  });

  it("409 cuando recepción ya lo canceló", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(tokenReminder({ status: "CANCELLED" }));

    const res = await POST(postRequest({ action: "confirm" }), params());
    expect(res.status).toBe(409);
  });

  it("409 si el turno cambió entre la lectura y la escritura", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(tokenReminder());
    prismaMock.shift.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(postRequest({ action: "cancel" }), params());
    expect(res.status).toBe(409);
    expect(prismaMock.shiftReminder.update).not.toHaveBeenCalled();
  });

  it("opt_out → marca al paciente y vale aunque el turno no admita cambios", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(tokenReminder({ status: "CANCELLED" }));

    const res = await POST(postRequest({ action: "opt_out" }), params());

    expect(res.status).toBe(200);
    expect(prismaMock.patient.update).toHaveBeenCalledWith({
      where: { id: "patient-1" },
      data: { reminderOptOut: true, reminderOptOutAt: expect.any(Date) },
    });
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
  });
});
