process.env.TZ = "UTC";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaMock, resetAllMocks } from "../setup";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notifications/email", () => ({
  isEmailConfigured: vi.fn(() => false),
  sendEmail: vi.fn(async () => ({ ok: true, provider: "resend", messageId: "m-1" })),
}));

import { logAudit } from "@/lib/audit";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/email";
import { hashConfirmationToken } from "@/lib/reminders/tokens";
import { ONLINE_SHIFT_OBSERVATIONS } from "@/lib/online-booking";
import { GET as getConfig } from "@/app/api/public/booking/config/route";
import { GET as getAvailability } from "@/app/api/public/booking/availability/route";
import { POST as createBooking } from "@/app/api/public/booking/route";
import { GET as getByToken, POST as postByToken } from "@/app/api/public/booking/[token]/route";

// Lunes 5/10/2026 09:00 hora AR
const NOW = new Date("2026-10-05T12:00:00.000Z");
// Martes 6/10 10:00 AR
const TUE_10 = "2026-10-06T13:00:00.000Z";
const IP = "203.0.113.9";

const SETTINGS = {
  name: "Consultorio Central",
  addressLine1: "Av. Siempreviva 742",
  addressLine2: null,
  onlineBookingEnabled: true,
  onlineBookingMinAdvanceHours: 2,
  onlineBookingMaxDaysAhead: 30,
  onlineBookingNotes: "Traé tu credencial",
};

const MEDIC = {
  id: "medic-1",
  firstName: "Laura",
  lastName: "Gervilla",
  name: "Laura Gervilla",
  slotDurationMinutes: 30,
  bufferMinutes: 0,
  minAdvanceMinutes: 60,
  notifyNewShift: true,
  notifyCancellation: true,
  specialization: { id: "spec-1", name: "Cardiología", color: "#0EA5E9" },
};

const WEEKDAY_HOURS = { fromHourAM: "09:00", toHourAM: "12:00", fromHourPM: null, toHourPM: null };

function prefFor(day: number) {
  return day >= 1 && day <= 5 ? { id: `pref-${day}`, userId: "medic-1", day, ...WEEKDAY_HOURS } : null;
}

// ─── Requests ────────────────────────────────────────────────────────────────

const headers = { "x-forwarded-for": IP, "user-agent": "vitest" };

function configRequest() {
  return new NextRequest("http://localhost:3000/api/public/booking/config", { headers });
}

function availabilityRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/public/booking/availability");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers });
}

function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/public/booking", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    medicId: "medic-1",
    start: TUE_10,
    consultationTypeId: null,
    firstName: "Ana María",
    lastName: "Pérez",
    dni: "30123456",
    phone: "11 5555-5555",
    email: "ana@example.com",
    healthInsurance: "OSDE",
    privacyAccepted: true,
    _hp: "",
    _elapsedMs: 15_000,
    ...overrides,
  };
}

const TOKEN = "tok_valid_abcdefghijklmnopqrstuv";
const tokenParams = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

function tokenGet(token = TOKEN) {
  return new NextRequest(`http://localhost:3000/api/public/booking/${token}`, { headers });
}

function tokenPost(body: unknown, token = TOKEN) {
  return new NextRequest(`http://localhost:3000/api/public/booking/${token}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function tokenRow(overrides: Record<string, unknown> = {}, shiftOverrides: Record<string, unknown> = {}) {
  const start = new Date(TUE_10);
  return {
    id: "obr-1",
    status: "PENDING_CONFIRMATION",
    requesterFirstName: "Ana María",
    requesterLastName: "Pérez",
    tokenExpiresAt: start,
    shiftId: "shift-1",
    shift: {
      id: "shift-1",
      start,
      status: "PENDING",
      userId: "medic-1",
      user: { firstName: "Laura", lastName: "Gervilla", name: "Laura Gervilla", notifyCancellation: true },
      consultationType: { name: "Control" },
      ...shiftOverrides,
    },
    patient: { deletedAt: null },
    ...overrides,
  };
}

// ─── Mocks base ──────────────────────────────────────────────────────────────

function setupCreateMocks() {
  prismaMock.user.findFirst.mockResolvedValue(MEDIC);
  prismaMock.user.findUnique.mockResolvedValue({ bufferMinutes: 0, minAdvanceMinutes: 60 });
  prismaMock.userPreference.findUnique.mockImplementation(
    async ({ where }: { where: { userId_day: { day: number } } }) => prefFor(where.userId_day.day),
  );
  prismaMock.blockDay.findFirst.mockResolvedValue(null);
  prismaMock.shift.findMany.mockResolvedValue([]);
  prismaMock.onlineBookingRequest.count.mockResolvedValue(0);
  prismaMock.patient.findUnique.mockResolvedValue(null);
  prismaMock.patient.create.mockResolvedValue({ id: "patient-new" });
  prismaMock.shift.create.mockResolvedValue({ id: "shift-new" });
  prismaMock.onlineBookingRequest.create.mockResolvedValue({ id: "obr-1" });
  prismaMock.user.findMany.mockResolvedValue([{ id: "sec-1" }, { id: "admin-1" }]);
}

beforeEach(() => {
  resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(isEmailConfigured).mockReturnValue(false);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, provider: "resend", messageId: "m-1" });
  prismaMock.clinicSettings.findUnique.mockResolvedValue(SETTINGS);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── GET /api/public/booking/config ─────────────────────────────────────────

describe("GET /api/public/booking/config", () => {
  it("con el módulo deshabilitado responde enabled=false sin exponer profesionales", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({ ...SETTINGS, onlineBookingEnabled: false });

    const res = await getConfig(configRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.enabled).toBe(false);
    expect(json.data.specialties).toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("agrupa por especialidad solo a profesionales activos que aceptan reservas online", async () => {
    prismaMock.consultationType.findMany.mockResolvedValue([{ id: "ct-1", name: "Control", durationMinutes: 20 }]);
    prismaMock.user.findMany.mockResolvedValue([
      { ...MEDIC },
      { id: "medic-2", firstName: "Pablo", lastName: "Ruiz", name: "Pablo Ruiz", slotDurationMinutes: 20, specialization: null },
    ]);

    const res = await getConfig(configRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      enabled: true,
      clinicName: "Consultorio Central",
      notes: "Traé tu credencial",
      minAdvanceHours: 2,
      maxDaysAhead: 30,
      consultationTypes: [{ id: "ct-1", name: "Control", durationMinutes: 20 }],
      specialties: [
        {
          id: "spec-1",
          name: "Cardiología",
          color: "#0EA5E9",
          medics: [{ id: "medic-1", shortName: "Dra. Gervilla", slotDurationMinutes: 30 }],
        },
        {
          id: "sin-especialidad",
          name: "Otros profesionales",
          color: null,
          medics: [{ id: "medic-2", shortName: "Dr. Ruiz", slotDurationMinutes: 20 }],
        },
      ],
    });
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ isActive: true, deletedAt: null, acceptsOnlineBooking: true });
  });
});

// ─── GET /api/public/booking/availability ───────────────────────────────────

describe("GET /api/public/booking/availability", () => {
  beforeEach(() => {
    prismaMock.user.findFirst.mockResolvedValue(MEDIC);
    prismaMock.userPreference.findMany.mockResolvedValue([1, 2, 3, 4, 5].map((d) => prefFor(d)));
    prismaMock.blockDay.findMany.mockResolvedValue([]);
    prismaMock.shift.findMany.mockResolvedValue([]);
  });

  it("503 con el módulo deshabilitado", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({ ...SETTINGS, onlineBookingEnabled: false });
    const res = await getAvailability(availabilityRequest({ medicId: "medic-1" }));
    expect(res.status).toBe(503);
  });

  it("404 si el profesional no existe, está inactivo o no acepta reservas online", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await getAvailability(availabilityRequest({ medicId: "medic-9" }));
    expect(res.status).toBe(404);
    const where = prismaMock.user.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "medic-9", isActive: true, deletedAt: null, acceptsOnlineBooking: true });
  });

  it("400 sin medicId o con fecha inválida", async () => {
    expect((await getAvailability(availabilityRequest({}))).status).toBe(400);
    expect((await getAvailability(availabilityRequest({ medicId: "medic-1", from: "05/10/2026" }))).status).toBe(400);
    expect((await getAvailability(availabilityRequest({ medicId: "medic-1", days: "30" }))).status).toBe(400);
  });

  it("respeta la anticipación mínima, turnos ocupados y días bloqueados", async () => {
    prismaMock.shift.findMany.mockResolvedValue([
      { start: new Date(TUE_10), end: new Date("2026-10-06T13:30:00.000Z") },
    ]);
    prismaMock.blockDay.findMany.mockResolvedValue([{ date: new Date("2026-10-07T00:00:00.000Z") }]);

    const res = await getAvailability(availabilityRequest({ medicId: "medic-1", from: "2026-10-05", days: "3" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json.data.durationMinutes).toBe(30);
    const [mon, tue, wed] = json.data.days;
    // Hoy 09:00 + 2 h (la mayor entre 60 min del médico y 2 h del consultorio) → solo 11:30
    expect(mon).toEqual({
      date: "2026-10-05",
      closed: false,
      slots: [{ start: "2026-10-05T14:30:00.000Z", time: "11:30" }],
    });
    expect(tue.slots.map((s: { time: string }) => s.time)).toEqual(["09:00", "09:30", "10:30", "11:00", "11:30"]);
    expect(wed).toEqual({ date: "2026-10-07", closed: true, slots: [] });
    // Nunca datos de otros turnos
    expect(JSON.stringify(json)).not.toMatch(/patient|observations/i);
  });

  it("cierra los días fuera de la ventana máxima (hoy + onlineBookingMaxDaysAhead)", async () => {
    const res = await getAvailability(availabilityRequest({ medicId: "medic-1", from: "2026-11-03", days: "3" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.days.map((d: { date: string; closed: boolean }) => [d.date, d.closed])).toEqual([
      ["2026-11-03", false],
      ["2026-11-04", false],
      ["2026-11-05", true], // 5/10 + 30 días = 4/11
    ]);
  });

  it("la duración sale del tipo de consulta; tipo inexistente → 400", async () => {
    prismaMock.consultationType.findUnique.mockResolvedValue({ id: "ct-1", durationMinutes: 40 });
    const res = await getAvailability(
      availabilityRequest({ medicId: "medic-1", from: "2026-10-06", days: "1", consultationTypeId: "ct-1" }),
    );
    const json = await res.json();
    expect(json.data.durationMinutes).toBe(40);
    expect(json.data.days[0].slots.map((s: { time: string }) => s.time)).toEqual(["09:00", "09:40", "10:20", "11:00"]);

    prismaMock.consultationType.findUnique.mockResolvedValue(null);
    const bad = await getAvailability(availabilityRequest({ medicId: "medic-1", consultationTypeId: "nope" }));
    expect(bad.status).toBe(400);
  });
});

// ─── POST /api/public/booking ───────────────────────────────────────────────

describe("POST /api/public/booking", () => {
  beforeEach(() => setupCreateMocks());

  it("crea turno PENDING online + paciente nuevo mínimo + request con token hasheado", async () => {
    const res = await createBooking(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({
      requestId: "obr-1",
      status: "PENDING_CONFIRMATION",
      start: TUE_10,
      medicShortName: "Dra. Gervilla",
      emailSent: false,
    });
    expect(json.data.manageUrl).toMatch(/^\/reserva\/[A-Za-z0-9_-]{16,128}$/);
    const token = json.data.manageUrl.split("/").pop();

    // Transacción READ COMMITTED con lock sobre el médico
    expect(prismaMock.$transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "ReadCommitted" });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw.mock.calls[0].slice(1)).toEqual(["medic-1"]);

    expect(prismaMock.patient.create.mock.calls[0][0].data).toEqual({
      firstName: "Ana María",
      lastName: "Pérez",
      dni: "30123456",
      telephone: "11 5555-5555",
      email: "ana@example.com",
      createdById: null,
      consentType: null,
    });
    expect(prismaMock.shift.create.mock.calls[0][0].data).toEqual({
      userId: "medic-1",
      patientId: "patient-new",
      start: new Date(TUE_10),
      end: new Date("2026-10-06T13:30:00.000Z"),
      status: "PENDING",
      source: "ONLINE",
      observations: ONLINE_SHIFT_OBSERVATIONS,
      consultationTypeId: null,
      // Cobertura (lib/shift-coverage.ts): paciente nuevo sin obra social → particular.
      coverageInsuranceId: null,
      isPrivate: true,
    });
    const reqData = prismaMock.onlineBookingRequest.create.mock.calls[0][0].data;
    expect(reqData).toMatchObject({
      shiftId: "shift-new",
      patientId: "patient-new",
      status: "PENDING_CONFIRMATION",
      requesterDni: "30123456",
      healthInsuranceText: "OSDE",
      matchedExisting: false,
      tokenHash: hashConfirmationToken(token),
      tokenExpiresAt: new Date(TUE_10),
      privacyAcceptedAt: NOW,
      ipAddress: IP,
    });
    expect(reqData.tokenHash).not.toBe(token);

    // Notifica a recepción/admin y al médico (notifyNewShift)
    const notified = prismaMock.notification.createMany.mock.calls[0][0].data.map((n: { userId: string }) => n.userId);
    expect(notified).toEqual(["sec-1", "admin-1", "medic-1"]);

    const audits = vi.mocked(logAudit).mock.calls.map((c) => [c[0].action, c[0].resource, c[0].resourceId]);
    expect(audits).toEqual([
      ["CREATE", "shift", "shift-new"],
      ["CREATE", "patient", "patient-new"],
    ]);
    // Sin email configurado no se envía
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("DNI existente: vincula sin modificar ni revelar los datos del paciente", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({
      id: "patient-9",
      firstName: "ANA",
      lastName: "PEREZ GARCIA",
      deletedAt: null,
    });

    const res = await createBooking(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
    expect(prismaMock.patient.update).not.toHaveBeenCalled();
    expect(prismaMock.patient.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.onlineBookingRequest.create.mock.calls[0][0].data).toMatchObject({
      patientId: "patient-9",
      matchedExisting: true,
      requesterFirstName: "Ana María",
      requesterLastName: "Pérez",
    });
    const body = JSON.stringify(json);
    expect(body).not.toContain("patient-9");
    expect(body).not.toContain("GARCIA");
    // Nombre compatible (sin acentos / mayúsculas): sin aviso de verificación
    expect(prismaMock.notification.createMany.mock.calls[0][0].data[0].message).not.toContain("verificá");
    // Solo se audita el turno (no hubo alta de paciente)
    expect(vi.mocked(logAudit)).toHaveBeenCalledTimes(1);
  });

  it("DNI existente con otro nombre: avisa a recepción, sin filtrarlo al solicitante", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({
      id: "patient-9",
      firstName: "Carlos",
      lastName: "Gómez",
      deletedAt: null,
    });

    const res = await createBooking(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(JSON.stringify(json)).not.toMatch(/Carlos|Gómez/);
    expect(prismaMock.notification.createMany.mock.calls[0][0].data[0].message).toContain(
      "El DNI ya estaba registrado con otro nombre",
    );
  });

  it("DNI de un paciente archivado: alta nueva sin DNI (no se revela nada)", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({
      id: "patient-old",
      firstName: "Ana",
      lastName: "Pérez",
      deletedAt: new Date("2025-01-01"),
    });

    const res = await createBooking(createRequest(validBody()));
    expect(res.status).toBe(201);
    expect(prismaMock.patient.create.mock.calls[0][0].data.dni).toBeNull();
    expect(prismaMock.onlineBookingRequest.create.mock.calls[0][0].data).toMatchObject({
      patientId: "patient-new",
      requesterDni: "30123456",
      matchedExisting: false,
    });
  });

  it("409 SLOT_TAKEN si el hueco se ocupó (re-chequeo dentro de la transacción)", async () => {
    prismaMock.shift.findMany.mockResolvedValue([
      { start: new Date(TUE_10), end: new Date("2026-10-06T13:30:00.000Z") },
    ]);

    const res = await createBooking(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("SLOT_TAKEN");
    expect(prismaMock.shift.create).not.toHaveBeenCalled();
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
  });

  it("422 si el horario no es un hueco de la agenda del profesional", async () => {
    const res = await createBooking(createRequest(validBody({ start: "2026-10-06T13:10:00.000Z" })));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.code).toBe("NOT_A_SLOT");
    expect(prismaMock.shift.create).not.toHaveBeenCalled();
  });

  it("422 fuera de la ventana: antes de la anticipación mínima o después de los días máximos", async () => {
    const tooSoon = await createBooking(createRequest(validBody({ start: "2026-10-05T13:00:00.000Z" })));
    expect(tooSoon.status).toBe(422);
    expect((await tooSoon.json()).code).toBe("OUT_OF_WINDOW");

    const tooFar = await createBooking(createRequest(validBody({ start: "2026-11-10T13:00:00.000Z" })));
    expect(tooFar.status).toBe(422);
    expect(prismaMock.shift.create).not.toHaveBeenCalled();
  });

  it("422 si el profesional no toma reservas online", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await createBooking(createRequest(validBody()));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("MEDIC_UNAVAILABLE");
  });

  it("409 TOO_MANY_PENDING con 3 reservas pendientes para el DNI", async () => {
    prismaMock.onlineBookingRequest.count.mockResolvedValue(3);

    const res = await createBooking(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("TOO_MANY_PENDING");
    expect(prismaMock.onlineBookingRequest.count.mock.calls[0][0].where).toMatchObject({
      requesterDni: "30123456",
      status: "PENDING_CONFIRMATION",
    });
    expect(prismaMock.shift.create).not.toHaveBeenCalled();
  });

  it("honeypot o envío demasiado rápido → respuesta con forma de éxito sin crear nada", async () => {
    for (const body of [validBody({ _hp: "http://spam" }), validBody({ _elapsedMs: 900 })]) {
      const res = await createBooking(createRequest(body));
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.manageUrl).toMatch(/^\/reserva\//);
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.shift.create).not.toHaveBeenCalled();
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
  });

  it("400 si no acepta la privacidad o el DNI es inválido", async () => {
    const res = await createBooking(createRequest(validBody({ privacyAccepted: false, dni: "12" })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.details.fieldErrors.privacyAccepted).toBeDefined();
    expect(json.details.fieldErrors.dni).toBeDefined();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("acepta DNI con puntos y email/obra social vacíos", async () => {
    const res = await createBooking(
      createRequest(validBody({ dni: "30.123.456", email: "", healthInsurance: "" })),
    );
    expect(res.status).toBe(201);
    const data = prismaMock.onlineBookingRequest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ requesterDni: "30123456", requesterEmail: null, healthInsuranceText: null });
  });

  it("503 con el módulo deshabilitado", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({ ...SETTINGS, onlineBookingEnabled: false });
    const res = await createBooking(createRequest(validBody()));
    expect(res.status).toBe(503);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("429 al superar 10 reservas por hora desde la misma IP", async () => {
    prismaMock.rateLimit.findUnique.mockResolvedValue({
      key: `booking-create:${IP}`,
      count: 10,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
    });
    prismaMock.rateLimit.update.mockResolvedValue({ count: 11 });

    const res = await createBooking(createRequest(validBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(prismaMock.rateLimit.findUnique).toHaveBeenCalledWith({ where: { key: `booking-create:${IP}` } });
  });

  it("con proveedor de email configurado envía el link de gestión y marca emailSentAt", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(true);

    const res = await createBooking(createRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.emailSent).toBe(true);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("ana@example.com");
    expect(mail.text).toContain(json.data.manageUrl);
    expect(mail.text).not.toContain("30123456");
    expect(prismaMock.onlineBookingRequest.update).toHaveBeenCalledWith({
      where: { id: "obr-1" },
      data: { emailSentAt: expect.any(Date) },
    });
  });

  it("reintenta una vez si otra alta ganó la carrera por el DNI (P2002)", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on dni", {
        code: "P2002",
        clientVersion: "6.0.0",
      }),
    );

    const res = await createBooking(createRequest(validBody()));
    expect(res.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });
});

// ─── /api/public/booking/[token] ────────────────────────────────────────────

describe("GET /api/public/booking/[token]", () => {
  it("404 sin consultar la base con un token malformado", async () => {
    const res = await getByToken(tokenGet("x"), tokenParams("x"));
    expect(res.status).toBe(404);
    expect(prismaMock.onlineBookingRequest.findUnique).not.toHaveBeenCalled();
  });

  it("404 genérico con token inexistente o vencido", async () => {
    const res = await getByToken(tokenGet(), tokenParams());
    expect(res.status).toBe(404);
    expect(prismaMock.onlineBookingRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashConfirmationToken(TOKEN) } }),
    );

    prismaMock.onlineBookingRequest.findUnique.mockResolvedValue(
      tokenRow({ tokenExpiresAt: new Date(NOW.getTime() - 1000) }),
    );
    const expired = await getByToken(tokenGet(), tokenParams());
    expect(expired.status).toBe(404);
    expect((await expired.json()).error).toBe("El link no es válido o ya venció");
  });

  it("devuelve la vista mínima con lo que cargó el solicitante", async () => {
    prismaMock.onlineBookingRequest.findUnique.mockResolvedValue(tokenRow());

    const res = await getByToken(tokenGet(), tokenParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      status: "PENDING_CONFIRMATION",
      clinicName: "Consultorio Central",
      address: "Av. Siempreviva 742",
      patientFirstName: "Ana",
      start: TUE_10,
      medicShortName: "Dra. Gervilla",
      consultationTypeName: "Control",
      canCancel: true,
    });
    // El select no pide datos del Patient más allá de si está archivado
    const select = prismaMock.onlineBookingRequest.findUnique.mock.calls[0][0].select;
    expect(select.patient).toEqual({ select: { deletedAt: true } });
  });

  it("si recepción canceló el turno desde la agenda, la reserva figura cancelada", async () => {
    prismaMock.onlineBookingRequest.findUnique.mockResolvedValue(tokenRow({}, { status: "CANCELLED" }));
    const json = await (await getByToken(tokenGet(), tokenParams())).json();
    expect(json.data.status).toBe("CANCELLED");
    expect(json.data.canCancel).toBe(false);
  });
});

describe("POST /api/public/booking/[token] (cancelación del paciente)", () => {
  beforeEach(() => {
    prismaMock.shift.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.onlineBookingRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findMany.mockResolvedValue([{ id: "sec-1" }]);
  });

  it("cancela turno y reserva de forma condicional y audita", async () => {
    prismaMock.onlineBookingRequest.findUnique.mockResolvedValue(tokenRow());

    const res = await postByToken(tokenPost({ action: "cancel" }), tokenParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("CANCELLED");
    expect(json.data.canCancel).toBe(false);
    expect(prismaMock.shift.updateMany).toHaveBeenCalledWith({
      where: { id: "shift-1", status: { in: ["PENDING", "CONFIRMED"] }, start: { gt: NOW } },
      data: { status: "CANCELLED" },
    });
    expect(prismaMock.onlineBookingRequest.updateMany.mock.calls[0][0].data).toEqual({
      status: "CANCELLED",
      cancelledAt: NOW,
      cancelledBy: "PATIENT",
    });
    expect(prismaMock.shiftReminder.updateMany).toHaveBeenCalled();
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({
      userId: null,
      action: "UPDATE",
      resource: "shift",
      resourceId: "shift-1",
    });
  });

  it("sigue funcionando con el módulo deshabilitado (quien reservó puede cancelar)", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({ ...SETTINGS, onlineBookingEnabled: false });
    prismaMock.onlineBookingRequest.findUnique.mockResolvedValue(tokenRow({ status: "CONFIRMED" }, { status: "CONFIRMED" }));

    const res = await postByToken(tokenPost({ action: "cancel" }), tokenParams());
    expect(res.status).toBe(200);
  });

  it("409 si el turno ya fue cancelado o finalizado", async () => {
    prismaMock.onlineBookingRequest.findUnique.mockResolvedValue(tokenRow({}, { status: "CANCELLED" }));

    const res = await postByToken(tokenPost({ action: "cancel" }), tokenParams());
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_STATE");
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
  });

  it("409 si recepción lo cambió entre la lectura y la escritura", async () => {
    prismaMock.onlineBookingRequest.findUnique.mockResolvedValue(tokenRow());
    prismaMock.shift.updateMany.mockResolvedValue({ count: 0 });

    const res = await postByToken(tokenPost({ action: "cancel" }), tokenParams());
    expect(res.status).toBe(409);
    expect(prismaMock.onlineBookingRequest.updateMany).not.toHaveBeenCalled();
  });

  it("404 con token inválido y 400 con acción desconocida", async () => {
    expect((await postByToken(tokenPost({ action: "cancel" }), tokenParams())).status).toBe(404);
    expect((await postByToken(tokenPost({ action: "confirm" }), tokenParams())).status).toBe(400);
  });
});
