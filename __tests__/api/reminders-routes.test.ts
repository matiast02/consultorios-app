import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole, isSecretaryOrAdmin } from "@/lib/auth-utils";

import { POST as cronPOST } from "@/app/api/cron/reminders/route";
import { GET as listGET, POST as planPOST } from "@/app/api/shifts/reminders/route";
import { POST as sendPOST } from "@/app/api/shifts/reminders/send/route";
import { PATCH } from "@/app/api/shifts/reminders/[id]/route";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/admin/clinic-settings/route";

vi.mock("@/lib/notifications/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, provider: "console" }),
  isEmailConfigured: vi.fn(() => false),
}));

const HOUR = 60 * 60 * 1000;

const EMPTY_SUMMARY = {
  planned: 0,
  sentEmail: 0,
  manualPending: 0,
  failed: 0,
  skippedOptOut: 0,
  skippedNoContact: 0,
};

function cronRequest(auth?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/reminders", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

function itemRow(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 20 * HOUR);
  return {
    id: "rem-1",
    shiftId: "shift-1",
    scheduledFor: new Date(start.getTime() - 24 * HOUR),
    status: "PENDING",
    channel: "WHATSAPP",
    offsetHours: 24,
    manual: true,
    deliveredTo: "1155667788",
    tokenHash: null,
    tokenExpiresAt: start,
    response: null,
    respondedAt: null,
    sentAt: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    shift: {
      id: "shift-1",
      start,
      status: "PENDING",
      patient: { firstName: "Tomás", lastName: "Sánchez", telephone: "1155667788" },
      user: { firstName: "Laura", lastName: "Gervilla", name: "Laura Gervilla", specialization: { color: "#0f766e" } },
    },
    ...overrides,
  };
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/shifts/reminders/rem-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const idParams = { params: Promise.resolve({ id: "rem-1" }) };

beforeEach(() => {
  resetAllMocks();
});

// ─── Cron ────────────────────────────────────────────────────────────────────

describe("POST /api/cron/reminders", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret-de-prueba";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("401 sin header Authorization", async () => {
    const res = await cronPOST(cronRequest());
    expect(res.status).toBe(401);
    expect(prismaMock.shift.findMany).not.toHaveBeenCalled();
  });

  it("401 con secret incorrecto", async () => {
    const res = await cronPOST(cronRequest("Bearer otro-secret"));
    expect(res.status).toBe(401);
  });

  it("503 si CRON_SECRET no está configurado", async () => {
    delete process.env.CRON_SECRET;
    const res = await cronPOST(cronRequest("Bearer s3cret-de-prueba"));
    expect(res.status).toBe(503);
  });

  it("200 con el resumen cuando el secret coincide", async () => {
    const res = await cronPOST(cronRequest("Bearer s3cret-de-prueba"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: EMPTY_SUMMARY });
    expect(prismaMock.shift.findMany).toHaveBeenCalled();
    expect(prismaMock.shiftReminder.findMany).toHaveBeenCalled();
  });
});

// ─── Recepción ───────────────────────────────────────────────────────────────

describe("/api/shifts/reminders (recepción)", () => {
  it("GET 401 sin sesión", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await listGET(new NextRequest("http://localhost:3000/api/shifts/reminders"));
    expect(res.status).toBe(401);
  });

  it("GET 403 para médicos", async () => {
    vi.mocked(isSecretaryOrAdmin).mockResolvedValue(false);
    const res = await listGET(new NextRequest("http://localhost:3000/api/shifts/reminders"));
    expect(res.status).toBe(403);
  });

  it("GET 400 con fecha inválida", async () => {
    const res = await listGET(new NextRequest("http://localhost:3000/api/shifts/reminders?date=2026-13-01"));
    expect(res.status).toBe(400);
  });

  it("GET lista los recordatorios de la fecha (hora argentina) con waLink para los manuales", async () => {
    prismaMock.shiftReminder.findMany.mockResolvedValue([itemRow()]);

    const res = await listGET(new NextRequest("http://localhost:3000/api/shifts/reminders?date=2026-09-25"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toMatchObject({ id: "rem-1", channel: "WHATSAPP", manual: true, status: "PENDING" });
    expect(json.data[0].waLink).toMatch(/^https:\/\/wa\.me\/5491155667788/);

    const where = prismaMock.shiftReminder.findMany.mock.calls[0][0].where;
    expect(where.shift.start.gte.toISOString()).toBe("2026-09-25T03:00:00.000Z");
    expect(where.shift.start.lt.toISOString()).toBe("2026-09-26T03:00:00.000Z");
  });

  it("POST planifica y devuelve el resumen", async () => {
    const res = await planPOST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual(EMPTY_SUMMARY);
  });

  it("POST /send 403 para médicos", async () => {
    vi.mocked(isSecretaryOrAdmin).mockResolvedValue(false);
    const res = await sendPOST();
    expect(res.status).toBe(403);
  });

  it("POST /send devuelve el ReminderDispatchSummary", async () => {
    const res = await sendPOST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual(EMPTY_SUMMARY);
  });
});

describe("PATCH /api/shifts/reminders/[id]", () => {
  it("404 si no existe", async () => {
    const res = await PATCH(patchRequest({ action: "mark_sent" }), idParams);
    expect(res.status).toBe(404);
  });

  it("400 con acción inválida", async () => {
    const res = await PATCH(patchRequest({ action: "delete" }), idParams);
    expect(res.status).toBe(400);
  });

  it("mark_sent marca SENT un WhatsApp manual", async () => {
    const row = itemRow();
    prismaMock.shiftReminder.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, status: "SENT", sentAt: new Date() });

    const res = await PATCH(patchRequest({ action: "mark_sent" }), idParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: expect.objectContaining({ status: "SENT", sentAt: expect.any(Date), manual: true }),
    });
    expect(json.data).toMatchObject({ status: "SENT", waLink: null });
  });

  it("mark_sent 409 si ya estaba enviado", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(itemRow({ status: "SENT" }));
    const res = await PATCH(patchRequest({ action: "mark_sent" }), idParams);
    expect(res.status).toBe(409);
  });

  it("mark_failed guarda la nota como motivo", async () => {
    const row = itemRow();
    prismaMock.shiftReminder.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, status: "FAILED" });

    const res = await PATCH(patchRequest({ action: "mark_failed", note: "Número equivocado" }), idParams);

    expect(res.status).toBe(200);
    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { status: "FAILED", errorMessage: "Número equivocado" },
    });
  });

  it("retry 409 si el recordatorio no está FAILED", async () => {
    prismaMock.shiftReminder.findUnique.mockResolvedValue(itemRow());
    const res = await PATCH(patchRequest({ action: "retry" }), idParams);
    expect(res.status).toBe(409);
  });

  it("retry vuelve a PENDING y despacha solo ese recordatorio", async () => {
    const row = itemRow({ status: "FAILED", errorMessage: "x" });
    prismaMock.shiftReminder.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, status: "PENDING" });

    const res = await PATCH(patchRequest({ action: "retry" }), idParams);

    expect(res.status).toBe(200);
    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { status: "PENDING", errorMessage: null, sentAt: null },
    });
    const dispatchWhere = prismaMock.shiftReminder.findMany.mock.calls[0][0].where;
    expect(dispatchWhere).toMatchObject({ id: "rem-1", status: "PENDING" });
  });
});

// ─── Configuración del consultorio ───────────────────────────────────────────

describe("/api/admin/clinic-settings (recordatorios)", () => {
  beforeEach(() => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
  });

  it("GET devuelve reminderChannels como array y emailConfigured", async () => {
    prismaMock.clinicSettings.upsert.mockResolvedValue({
      id: "default",
      mapLat: null,
      mapLng: null,
      reminderChannels: '["EMAIL"]',
      remindersEnabled: true,
    });
    const res = await settingsGET();
    const json = await res.json();
    expect(json.data.reminderChannels).toEqual(["EMAIL"]);
    expect(json.data.emailConfigured).toBe(false);
  });

  it("PUT solo con campos de recordatorios no pisa los datos del sitio", async () => {
    prismaMock.clinicSettings.upsert.mockResolvedValue({ id: "default", reminderChannels: "[]" });
    const req = new NextRequest("http://localhost:3000/api/admin/clinic-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remindersEnabled: true,
        reminderHoursBefore: 24,
        reminderSecondHoursBefore: 2,
        reminderChannels: ["WHATSAPP", "WHATSAPP"],
        reminderTemplate: "  ",
      }),
    });

    const res = await settingsPUT(req);
    expect(res.status).toBe(200);
    const update = prismaMock.clinicSettings.upsert.mock.calls[0][0].update;
    expect(update).toEqual({
      remindersEnabled: true,
      reminderHoursBefore: 24,
      reminderSecondHoursBefore: 2,
      reminderChannels: '["WHATSAPP"]',
      reminderTemplate: null,
    });
  });

  it("PUT 400 si el segundo recordatorio no es más cercano que el primero", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/clinic-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderHoursBefore: 12, reminderSecondHoursBefore: 12 }),
    });
    const res = await settingsPUT(req);
    expect(res.status).toBe(400);
    expect(prismaMock.clinicSettings.upsert).not.toHaveBeenCalled();
  });

  it("PUT 400 fuera de rango", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/clinic-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderHoursBefore: 500, reminderChannels: ["FAX"] }),
    });
    const res = await settingsPUT(req);
    expect(res.status).toBe(400);
  });
});
