// Política de agenda (B12): la agenda es del médico; la editan él, el admin y
// la secretaria salvo candado (`agendaLocked`). Otro médico o sin rol: nunca.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { AGENDA_LOCKED_MESSAGE, canEditAgenda } from "@/lib/agenda-access";
import { POST as savePreferences } from "@/app/api/preferences/route";
import { PUT as blockDays, DELETE as unblockDay } from "@/app/api/preferences/block-days/route";

const asRole = (role: string | null) => vi.mocked(getUserRole).mockResolvedValue(role);
const medic = (over: Record<string, unknown> = {}) => ({
  id: "medic-1",
  agendaLocked: false,
  roles: [{ role: { name: "medic" } }],
  ...over,
});
const target = (row: unknown) => prismaMock.user.findFirst.mockResolvedValue(row);
const req = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const PREFS = {
  userId: "medic-1",
  preferences: [{ day: 1, fromHourAM: "09:00", toHourAM: "12:00", fromHourPM: null, toHourPM: null }],
};
const BLOCK = { userId: "medic-1", dates: ["2026-10-07"] };

beforeEach(() => resetAllMocks());

describe("canEditAgenda", () => {
  it("objetivo inexistente, dado de baja o que no es médico → 404", async () => {
    asRole("admin");
    target(null);
    expect(await canEditAgenda("user-1", "nope")).toMatchObject({ ok: false, status: 404 });
    target(medic({ roles: [{ role: { name: "secretary" } }] }));
    expect(await canEditAgenda("user-1", "medic-1")).toMatchObject({ ok: false, status: 404 });
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ id: "nope", deletedAt: null });
  });

  it("el propio médico y el admin editan siempre, aun con candado", async () => {
    target(medic({ id: "user-1", agendaLocked: true }));
    asRole("medic");
    expect(await canEditAgenda("user-1", "user-1")).toMatchObject({ ok: true });
    target(medic({ agendaLocked: true }));
    asRole("admin");
    expect(await canEditAgenda("user-1", "medic-1")).toMatchObject({ ok: true });
  });

  it("secretaria: sí sin candado, 403 con candado", async () => {
    asRole("secretary");
    target(medic());
    expect(await canEditAgenda("user-1", "medic-1")).toMatchObject({ ok: true });
    target(medic({ agendaLocked: true }));
    expect(await canEditAgenda("user-1", "medic-1")).toEqual({ ok: false, status: 403, error: AGENDA_LOCKED_MESSAGE });
  });

  it("otro médico → 403; sin rol conocido → 403 sin consultar al objetivo", async () => {
    asRole("medic");
    target(medic());
    expect(await canEditAgenda("user-1", "medic-1")).toMatchObject({ ok: false, status: 403 });
    asRole(null);
    prismaMock.user.findFirst.mockClear();
    expect(await canEditAgenda("user-1", "medic-1")).toMatchObject({ ok: false, status: 403 });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("rutas de agenda aplican la política", () => {
  it("POST /api/preferences: secretaria con candado → 403 y no escribe; sin candado → 200", async () => {
    asRole("secretary");
    target(medic({ agendaLocked: true }));
    const denied = await savePreferences(req("http://x/api/preferences", "POST", PREFS));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe(AGENDA_LOCKED_MESSAGE);
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled();

    target(medic());
    prismaMock.userPreference.upsert.mockResolvedValue({ userId: "medic-1", day: 1 });
    expect((await savePreferences(req("http://x/api/preferences", "POST", PREFS))).status).toBe(200);
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1);
  });

  it("PUT /api/preferences/block-days: otro médico → 403; objetivo no médico → 404", async () => {
    asRole("medic");
    target(medic());
    expect((await blockDays(req("http://x/api/preferences/block-days", "PUT", BLOCK))).status).toBe(403);
    target(null);
    expect((await blockDays(req("http://x/api/preferences/block-days", "PUT", BLOCK))).status).toBe(404);
    expect(prismaMock.blockDay.createMany).not.toHaveBeenCalled();
  });

  it("DELETE /api/preferences/block-days: aplica el candado del dueño del bloqueo", async () => {
    prismaMock.blockDay.findUnique.mockResolvedValue({ id: "bd-1", userId: "medic-1", date: new Date() });
    asRole("secretary");
    target(medic({ agendaLocked: true }));
    expect((await unblockDay(req("http://x/api/preferences/block-days", "DELETE", { id: "bd-1" }))).status).toBe(403);
    expect(prismaMock.blockDay.delete).not.toHaveBeenCalled();
    expect(prismaMock.user.findFirst.mock.calls[0][0].where.id).toBe("medic-1");

    asRole("admin");
    prismaMock.blockDay.delete.mockResolvedValue({ id: "bd-1" });
    expect((await unblockDay(req("http://x/api/preferences/block-days", "DELETE", { id: "bd-1" }))).status).toBe(200);
  });
});
