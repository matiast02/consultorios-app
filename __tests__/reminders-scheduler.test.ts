import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import { sendEmail } from "@/lib/notifications/email";
import { hashConfirmationToken } from "@/lib/reminders/tokens";
import {
  arDayRange,
  arTomorrowKey,
  chooseChannel,
  deriveConfirmationToken,
  dispatchDue,
  parseReminderChannels,
  planReminders,
  reminderToItem,
  runReminderCycle,
  type ReminderConfig,
} from "@/lib/reminders/scheduler";

vi.mock("@/lib/notifications/email", () => ({
  sendEmail: vi.fn(),
  isEmailConfigured: vi.fn(() => false),
}));

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-24T12:00:00.000Z");

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    name: "Consultorio Central",
    addressLine1: "Av. Siempreviva 742",
    addressLine2: "Piso 2",
    remindersEnabled: true,
    reminderHoursBefore: 24,
    reminderSecondHoursBefore: null,
    reminderChannels: '["EMAIL","WHATSAPP"]',
    reminderTemplate: null,
    ...overrides,
  };
}

function shiftForPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    start: new Date(NOW.getTime() + 24 * HOUR + 30 * 60 * 1000), // mañana, dentro de la ventana
    patient: { email: "ana@example.com", telephone: "1155667788", reminderOptOut: false },
    reminders: [] as Array<{ id: string; offsetHours: number; status: string; tokenExpiresAt: Date | null }>,
    ...overrides,
  };
}

function dueReminder(overrides: Record<string, unknown> = {}, shiftOverrides: Record<string, unknown> = {}) {
  const start = new Date(NOW.getTime() + 23 * HOUR);
  return {
    id: "rem-1",
    shiftId: "shift-1",
    scheduledFor: new Date(start.getTime() - 24 * HOUR),
    status: "PENDING",
    channel: "EMAIL",
    offsetHours: 24,
    manual: false,
    deliveredTo: null,
    tokenHash: "placeholder",
    tokenExpiresAt: start,
    response: null,
    respondedAt: null,
    sentAt: null,
    errorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    shift: {
      id: "shift-1",
      start,
      status: "PENDING",
      patient: {
        firstName: "Ana María",
        email: "ana@example.com",
        telephone: "1155667788",
        reminderOptOut: false,
        deletedAt: null,
      },
      user: { firstName: "Laura", lastName: "Gervilla", name: "Laura Gervilla" },
      ...shiftOverrides,
    },
    ...overrides,
  };
}

function createdRows(): Array<Record<string, unknown>> {
  const call = prismaMock.shiftReminder.createMany.mock.calls[0];
  return (call?.[0] as { data: Array<Record<string, unknown>> } | undefined)?.data ?? [];
}

beforeEach(() => {
  resetAllMocks();
  prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow());
  prismaMock.shiftReminder.createMany.mockImplementation(async (args: { data: unknown[] }) => ({
    count: args.data.length,
  }));
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, provider: "console", messageId: "m-1" });
});

// ─── planReminders ───────────────────────────────────────────────────────────

describe("planReminders", () => {
  it("crea el recordatorio por email con token, vencimiento y hora de envío", async () => {
    const shift = shiftForPlan();
    prismaMock.shift.findMany.mockResolvedValue([shift]);

    const summary = await planReminders(NOW);

    expect(summary.planned).toBe(1);
    const rows = createdRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      shiftId: "shift-1",
      channel: "EMAIL",
      manual: false,
      offsetHours: 24,
      status: "PENDING",
      tokenExpiresAt: shift.start,
    });
    expect((rows[0].scheduledFor as Date).getTime()).toBe(shift.start.getTime() - 24 * HOUR);
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prismaMock.shiftReminder.createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
  });

  it("busca turnos activos entre ahora y ahora + mayor offset + 1 h", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow({ reminderSecondHoursBefore: 2 }));
    await planReminders(NOW);

    const where = prismaMock.shift.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["PENDING", "CONFIRMED"] });
    expect(where.start.gt).toEqual(NOW);
    expect(where.start.lte.getTime()).toBe(NOW.getTime() + 25 * HOUR);
    expect(where.patient).toEqual({ deletedAt: null });
  });

  it("es idempotente: no vuelve a crear un offset que ya existe", async () => {
    const shift = shiftForPlan();
    shift.reminders = [{ id: "rem-1", offsetHours: 24, status: "SENT", tokenExpiresAt: shift.start }];
    prismaMock.shift.findMany.mockResolvedValue([shift]);

    const summary = await planReminders(NOW);

    expect(summary.planned).toBe(0);
    expect(prismaMock.shiftReminder.createMany).not.toHaveBeenCalled();
  });

  it("con segundo recordatorio crea los dos offsets", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow({ reminderSecondHoursBefore: 2 }));
    prismaMock.shift.findMany.mockResolvedValue([shiftForPlan()]);

    const summary = await planReminders(NOW);

    expect(summary.planned).toBe(2);
    expect(createdRows().map((r) => r.offsetHours)).toEqual([24, 2]);
  });

  it("si el de 24 h ya está atrasado y hay uno de 2 h, solo crea el de 2 h", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow({ reminderSecondHoursBefore: 2 }));
    prismaMock.shift.findMany.mockResolvedValue([
      shiftForPlan({ start: new Date(NOW.getTime() + 10 * HOUR) }),
    ]);

    await planReminders(NOW);

    expect(createdRows().map((r) => r.offsetHours)).toEqual([2]);
  });

  it("recupera un recordatorio atrasado si es el único offset (turno sacado con menos de 24 h)", async () => {
    prismaMock.shift.findMany.mockResolvedValue([
      shiftForPlan({ start: new Date(NOW.getTime() + 5 * HOUR) }),
    ]);

    await planReminders(NOW);

    const rows = createdRows();
    expect(rows).toHaveLength(1);
    expect((rows[0].scheduledFor as Date).getTime()).toBeLessThan(NOW.getTime());
  });

  it("no crea recordatorios para pacientes con opt-out", async () => {
    prismaMock.shift.findMany.mockResolvedValue([
      shiftForPlan({ patient: { email: "ana@example.com", telephone: "1155667788", reminderOptOut: true } }),
    ]);

    const summary = await planReminders(NOW);

    expect(summary.skippedOptOut).toBe(1);
    expect(summary.planned).toBe(0);
    expect(prismaMock.shiftReminder.createMany).not.toHaveBeenCalled();
  });

  it("no crea recordatorios sin datos de contacto", async () => {
    prismaMock.shift.findMany.mockResolvedValue([
      shiftForPlan({ patient: { email: null, telephone: null, reminderOptOut: false } }),
    ]);

    const summary = await planReminders(NOW);

    expect(summary.skippedNoContact).toBe(1);
    expect(prismaMock.shiftReminder.createMany).not.toHaveBeenCalled();
  });

  it("sin email elige WhatsApp manual", async () => {
    prismaMock.shift.findMany.mockResolvedValue([
      shiftForPlan({ patient: { email: null, telephone: "11 5566-7788", reminderOptOut: false } }),
    ]);

    await planReminders(NOW);

    expect(createdRows()[0]).toMatchObject({ channel: "WHATSAPP", manual: true });
  });

  it("con email pero canal EMAIL deshabilitado elige WhatsApp", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow({ reminderChannels: '["WHATSAPP"]' }));
    prismaMock.shift.findMany.mockResolvedValue([shiftForPlan()]);

    await planReminders(NOW);

    expect(createdRows()[0]).toMatchObject({ channel: "WHATSAPP", manual: true });
  });

  it("solo teléfono y WhatsApp deshabilitado → sin contacto", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow({ reminderChannels: '["EMAIL"]' }));
    prismaMock.shift.findMany.mockResolvedValue([
      shiftForPlan({ patient: { email: null, telephone: "1155667788", reminderOptOut: false } }),
    ]);

    const summary = await planReminders(NOW);

    expect(summary.skippedNoContact).toBe(1);
  });

  it("resincroniza los pendientes de un turno reprogramado", async () => {
    const shift = shiftForPlan();
    shift.reminders = [
      { id: "rem-9", offsetHours: 24, status: "PENDING", tokenExpiresAt: new Date(NOW.getTime() + 2 * HOUR) },
    ];
    prismaMock.shift.findMany.mockResolvedValue([shift]);

    await planReminders(NOW);

    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-9" },
      data: { scheduledFor: new Date(shift.start.getTime() - 24 * HOUR), tokenExpiresAt: shift.start },
    });
  });

  it("no hace nada si los recordatorios están deshabilitados", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow({ remindersEnabled: false }));

    const summary = await planReminders(NOW);

    expect(summary).toEqual({
      planned: 0,
      sentEmail: 0,
      manualPending: 0,
      failed: 0,
      skippedOptOut: 0,
      skippedNoContact: 0,
    });
    expect(prismaMock.shift.findMany).not.toHaveBeenCalled();
  });

  it("usa los defaults si no existe ClinicSettings", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(null);
    prismaMock.shift.findMany.mockResolvedValue([shiftForPlan()]);

    const summary = await planReminders(NOW);

    expect(summary.planned).toBe(1);
  });
});

// ─── dispatchDue ─────────────────────────────────────────────────────────────

describe("dispatchDue", () => {
  beforeEach(() => {
    prismaMock.shiftReminder.updateMany.mockResolvedValue({ count: 1 }); // reserva OK
  });

  it("envía el email, persiste el hash del token del link y marca SENT", async () => {
    prismaMock.shiftReminder.findMany.mockResolvedValue([dueReminder()]);

    const summary = await dispatchDue(NOW);

    expect(summary.sentEmail).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const msg = vi.mocked(sendEmail).mock.calls[0][0];
    expect(msg.to).toBe("ana@example.com");
    expect(msg.text).toContain("Hola Ana,");
    expect(msg.text).toContain("Dra. Gervilla");

    // El link del email corresponde al hash guardado.
    const token = deriveConfirmationToken("rem-1");
    expect(msg.text).toContain(`/turno/${token}`);
    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { tokenHash: hashConfirmationToken(token) },
    });

    const final = prismaMock.shiftReminder.update.mock.calls.at(-1)![0];
    expect(final.data).toMatchObject({ status: "SENT", sentAt: NOW, deliveredTo: "ana@example.com", errorMessage: null });
  });

  it("no incluye datos clínicos en el mensaje", async () => {
    const r = dueReminder();
    (r.shift as Record<string, unknown>).observations = "Control HTA";
    prismaMock.shiftReminder.findMany.mockResolvedValue([r]);

    await dispatchDue(NOW);

    const msg = vi.mocked(sendEmail).mock.calls[0][0];
    expect(msg.text).not.toContain("HTA");
    expect(msg.html).not.toContain("HTA");
  });

  it("si el proveedor falla marca FAILED con el error", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, provider: "resend", error: "Resend 422: invalid" });
    prismaMock.shiftReminder.findMany.mockResolvedValue([dueReminder()]);

    const summary = await dispatchDue(NOW);

    expect(summary.failed).toBe(1);
    const final = prismaMock.shiftReminder.update.mock.calls.at(-1)![0];
    expect(final.data).toMatchObject({ status: "FAILED", errorMessage: "Resend 422: invalid" });
  });

  it("no manda el email si otra corrida ya lo reservó", async () => {
    prismaMock.shiftReminder.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.shiftReminder.findMany.mockResolvedValue([dueReminder()]);

    const summary = await dispatchDue(NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(summary.sentEmail).toBe(0);
  });

  it("WhatsApp queda PENDING manual con el teléfono (lo envía recepción)", async () => {
    prismaMock.shiftReminder.findMany.mockResolvedValue([
      dueReminder(
        { channel: "WHATSAPP", manual: true },
        {
          patient: {
            firstName: "Ana",
            email: null,
            telephone: "1155667788",
            reminderOptOut: false,
            deletedAt: null,
          },
        },
      ),
    ]);

    const summary = await dispatchDue(NOW);

    expect(summary.manualPending).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    const call = prismaMock.shiftReminder.update.mock.calls[0][0];
    expect(call.data).toMatchObject({ channel: "WHATSAPP", manual: true, deliveredTo: "1155667788" });
    expect(call.data.status).toBeUndefined();
  });

  it("turno cancelado → FAILED 'Turno ya no vigente'", async () => {
    prismaMock.shiftReminder.findMany.mockResolvedValue([dueReminder({}, { status: "CANCELLED" })]);

    await dispatchDue(NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { status: "FAILED", errorMessage: "Turno ya no vigente" },
    });
  });

  it("paciente con opt-out posterior al plan → FAILED sin enviar", async () => {
    prismaMock.shiftReminder.findMany.mockResolvedValue([
      dueReminder(
        {},
        {
          patient: {
            firstName: "Ana",
            email: "ana@example.com",
            telephone: null,
            reminderOptOut: true,
            deletedAt: null,
          },
        },
      ),
    ]);

    const summary = await dispatchDue(NOW);

    expect(summary.skippedOptOut).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("consulta solo PENDING vencidos", async () => {
    await dispatchDue(NOW);
    const where = prismaMock.shiftReminder.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "PENDING", scheduledFor: { lte: NOW } });
  });

  it("no hace nada si los recordatorios están deshabilitados", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue(settingsRow({ remindersEnabled: false }));
    const summary = await dispatchDue(NOW);
    expect(summary.sentEmail).toBe(0);
    expect(prismaMock.shiftReminder.findMany).not.toHaveBeenCalled();
  });
});

describe("runReminderCycle", () => {
  it("combina plan + dispatch en un solo resumen", async () => {
    prismaMock.shiftReminder.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.shift.findMany.mockResolvedValue([
      shiftForPlan(),
      shiftForPlan({ id: "shift-2", patient: { email: null, telephone: null, reminderOptOut: false } }),
    ]);
    prismaMock.shiftReminder.findMany.mockResolvedValue([dueReminder()]);

    const summary = await runReminderCycle(NOW);

    expect(summary).toMatchObject({ planned: 1, sentEmail: 1, skippedNoContact: 1 });
  });
});

// ─── reminderToItem / tokens ─────────────────────────────────────────────────

describe("reminderToItem", () => {
  const config: ReminderConfig = {
    remindersEnabled: true,
    reminderHoursBefore: 24,
    reminderSecondHoursBefore: null,
    reminderChannels: ["EMAIL", "WHATSAPP"],
    reminderTemplate: null,
    clinicName: "Consultorio Central",
    address: "Av. Siempreviva 742",
  };
  const start = new Date(NOW.getTime() + 20 * HOUR);
  const base = {
    id: "rem-7",
    shiftId: "shift-7",
    status: "PENDING" as const,
    channel: "WHATSAPP",
    offsetHours: 24,
    manual: true,
    deliveredTo: "1155667788",
    tokenHash: null as string | null,
    tokenExpiresAt: start,
    response: null,
    respondedAt: null,
    errorMessage: null,
  };
  const patient = { firstName: "Tomás", lastName: "Sánchez", telephone: "1155667788" };
  const medic = { firstName: "Laura", lastName: "Gervilla", name: "Laura Gervilla", specialization: { color: "#0f766e" } };

  it("calcula el waLink con un token estable y persiste su hash", async () => {
    const item = await reminderToItem(base, { start }, patient, medic, config, NOW);

    const token = deriveConfirmationToken("rem-7");
    expect(item.waLink).toMatch(/^https:\/\/wa\.me\/5491155667788\?text=/);
    expect(decodeURIComponent(item.waLink!.split("text=")[1])).toContain(`/turno/${token}`);
    expect(item).toMatchObject({
      channel: "WHATSAPP",
      manual: true,
      offsetHours: 24,
      patientShortName: "Sánchez, Tomás",
      medicShortName: "Dra. Gervilla",
      medicColor: "#0f766e",
    });
    expect(prismaMock.shiftReminder.update).toHaveBeenCalledWith({
      where: { id: "rem-7" },
      data: { tokenHash: hashConfirmationToken(token) },
    });

    // Recalcular (polling del dashboard) no rota el token ni vuelve a escribir.
    prismaMock.shiftReminder.update.mockClear();
    const again = await reminderToItem(
      { ...base, tokenHash: hashConfirmationToken(token) },
      { start },
      patient,
      medic,
      config,
      NOW,
    );
    expect(again.waLink).toBe(item.waLink);
    expect(prismaMock.shiftReminder.update).not.toHaveBeenCalled();
  });

  it("sin waLink para recordatorios enviados o de email", async () => {
    const sent = await reminderToItem({ ...base, status: "SENT" }, { start }, patient, medic, config, NOW);
    const email = await reminderToItem({ ...base, channel: "EMAIL", manual: false }, { start }, patient, medic, config, NOW);
    expect(sent.waLink).toBeNull();
    expect(email.waLink).toBeNull();
    expect(prismaMock.shiftReminder.update).not.toHaveBeenCalled();
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe("helpers", () => {
  it("parseReminderChannels tolera JSON, CSV, minúsculas y basura", () => {
    expect(parseReminderChannels('["EMAIL","WHATSAPP"]')).toEqual(["EMAIL", "WHATSAPP"]);
    expect(parseReminderChannels("email, whatsapp")).toEqual(["EMAIL", "WHATSAPP"]);
    expect(parseReminderChannels('["EMAIL","EMAIL","FAX"]')).toEqual(["EMAIL"]);
    expect(parseReminderChannels("[]")).toEqual([]);
    expect(parseReminderChannels("{roto")).toEqual(["EMAIL", "WHATSAPP"]);
    expect(parseReminderChannels(null)).toEqual(["EMAIL", "WHATSAPP"]);
    expect(parseReminderChannels("")).toEqual(["EMAIL", "WHATSAPP"]);
  });

  it("chooseChannel prioriza email y exige teléfono utilizable para WhatsApp", () => {
    expect(chooseChannel({ email: "a@b.co", telephone: "1155667788" }, ["EMAIL", "WHATSAPP"])?.channel).toBe("EMAIL");
    expect(chooseChannel({ email: "no-es-email", telephone: "1155667788" }, ["EMAIL", "WHATSAPP"])?.channel).toBe(
      "WHATSAPP",
    );
    expect(chooseChannel({ email: null, telephone: "123" }, ["EMAIL", "WHATSAPP"])).toBeNull();
  });

  it("fechas en zona argentina", () => {
    // 2026-09-24 23:30 en Argentina = 2026-09-25 02:30 UTC → mañana es el 25
    expect(arTomorrowKey(new Date("2026-09-25T02:30:00Z"))).toBe("2026-09-25");
    expect(arDayRange("2026-09-25")?.start.toISOString()).toBe("2026-09-25T03:00:00.000Z");
    expect(arDayRange("2026-02-31")).toBeNull();
    expect(arDayRange("25/09/2026")).toBeNull();
  });
});
