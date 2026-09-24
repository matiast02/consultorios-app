import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";

vi.mock("@/lib/notifications/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, provider: "console" }),
  isEmailConfigured: vi.fn(() => false),
}));

import { GET as clinicInfo } from "@/app/api/public/clinic-info/route";
import { PUT as settingsPUT } from "@/app/api/admin/clinic-settings/route";
import { GET as prefsGET, PUT as prefsPUT } from "@/app/api/user/preferences-config/route";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => resetAllMocks());

describe("GET /api/public/clinic-info", () => {
  it("de la reserva online solo expone el flag onlineBookingEnabled", async () => {
    prismaMock.clinicSettings.findUnique.mockResolvedValue({
      id: "default",
      name: "Consultorio Central",
      mapLat: null,
      mapLng: null,
      remindersEnabled: true,
      reminderHoursBefore: 24,
      reminderSecondHoursBefore: null,
      reminderChannels: "[]",
      reminderTemplate: "secreto",
      onlineBookingEnabled: true,
      onlineBookingMinAdvanceHours: 2,
      onlineBookingMaxDaysAhead: 30,
      onlineBookingNotes: "Traé tu credencial",
    });

    const res = await clinicInfo();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.settings.onlineBookingEnabled).toBe(true);
    for (const key of [
      "onlineBookingMinAdvanceHours",
      "onlineBookingMaxDaysAhead",
      "onlineBookingNotes",
      "reminderTemplate",
    ]) {
      expect(json.data.settings).not.toHaveProperty(key);
    }
  });
});

describe("PUT /api/admin/clinic-settings (reservas online)", () => {
  beforeEach(() => {
    vi.mocked(getUserRole).mockResolvedValue("admin");
    prismaMock.clinicSettings.upsert.mockResolvedValue({
      id: "default",
      mapLat: null,
      mapLng: null,
      reminderChannels: "[]",
      onlineBookingEnabled: true,
      onlineBookingMinAdvanceHours: 4,
      onlineBookingMaxDaysAhead: 60,
      onlineBookingNotes: "Traé DNI",
    });
  });

  it("guarda solo los campos de reservas presentes, sin pisar los del sitio", async () => {
    const res = await settingsPUT(
      jsonRequest("http://localhost:3000/api/admin/clinic-settings", {
        onlineBookingEnabled: true,
        onlineBookingMinAdvanceHours: 4,
        onlineBookingMaxDaysAhead: 60,
        onlineBookingNotes: "  Traé DNI  ",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.onlineBookingEnabled).toBe(true);
    const { update } = prismaMock.clinicSettings.upsert.mock.calls[0][0];
    expect(update).toEqual({
      onlineBookingEnabled: true,
      onlineBookingMinAdvanceHours: 4,
      onlineBookingMaxDaysAhead: 60,
      onlineBookingNotes: "Traé DNI",
    });
  });

  it("400 con valores fuera de rango", async () => {
    const res = await settingsPUT(
      jsonRequest("http://localhost:3000/api/admin/clinic-settings", { onlineBookingMaxDaysAhead: 500 }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.clinicSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("/api/user/preferences-config (acceptsOnlineBooking)", () => {
  it("PUT acepta acceptsOnlineBooking y GET lo devuelve", async () => {
    prismaMock.user.update.mockResolvedValue({ acceptsOnlineBooking: false });
    const res = await prefsPUT(
      jsonRequest("http://localhost:3000/api/user/preferences-config", { acceptsOnlineBooking: false }),
    );
    expect(res.status).toBe(200);
    const args = prismaMock.user.update.mock.calls[0][0];
    expect(args.data).toEqual({ acceptsOnlineBooking: false });
    expect(args.select.acceptsOnlineBooking).toBe(true);

    prismaMock.user.findUnique.mockResolvedValue({ acceptsOnlineBooking: true });
    await prefsGET();
    expect(prismaMock.user.findUnique.mock.calls[0][0].select.acceptsOnlineBooking).toBe(true);
  });

  it("400 si acceptsOnlineBooking no es booleano", async () => {
    const res = await prefsPUT(
      jsonRequest("http://localhost:3000/api/user/preferences-config", { acceptsOnlineBooking: "si" }),
    );
    expect(res.status).toBe(400);
  });
});
