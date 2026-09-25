// Política de turnos (B11): el médico solo gestiona los suyos y no asigna a
// otros; secretaria y admin ven y asignan todo; sin rol conocido, nada.
// Ajeno para un médico responde 404 (como inexistente).
process.env.TZ = "UTC";

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { GET as listShifts, POST as createShift } from "@/app/api/shifts/route";
import { GET as getShift, PUT as updateShift, DELETE as deleteShift } from "@/app/api/shifts/[id]/route";
import { POST as createSeries } from "@/app/api/shifts/recurring/route";
import { GET as getSeries, DELETE as cancelSeries } from "@/app/api/shifts/recurring/[groupId]/route";
import { POST as markArrival, DELETE as clearArrival } from "@/app/api/shifts/[id]/arrival/route";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const asRole = (role: string | null) => vi.mocked(getUserRole).mockResolvedValue(role);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const groupCtx = (groupId: string) => ({ params: Promise.resolve({ groupId }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const audits = () => vi.mocked(logAudit).mock.calls.map((c) => c[0]);

const OWN = {
  id: "s1",
  userId: "user-1", // la sesión de los tests es user-1
  patientId: "p1",
  start: new Date("2026-10-01T10:00:00Z"),
  end: new Date("2026-10-01T10:30:00Z"),
  status: "PENDING",
};
const FOREIGN = { ...OWN, id: "s2", userId: "medic-2" };
const BODY = {
  userId: "user-1",
  patientId: "p1",
  start: "2026-10-01T10:00:00.000Z",
  end: "2026-10-01T10:30:00.000Z",
  status: "PENDING",
};
const SERIES_BODY = {
  userId: "medic-2",
  patientId: "p1",
  startDate: "2026-10-05",
  startTime: "10:00",
  endTime: "10:30",
  frequencyWeeks: 1,
  count: 2,
};

function happyCreate(id = "s1") {
  prismaMock.patient.findFirst.mockResolvedValue({ id: "p1", osId: null });
  prismaMock.shift.create.mockResolvedValue({ ...OWN, id });
}

beforeEach(() => resetAllMocks());

describe("turnos: usuario sin rol conocido", () => {
  it("403 en listar, crear, ver, editar y borrar", async () => {
    asRole(null);
    expect((await listShifts(req("http://x/api/shifts", "GET"))).status).toBe(403);
    expect((await createShift(req("http://x/api/shifts", "POST", BODY))).status).toBe(403);
    expect((await getShift(req("http://x/api/shifts/s1", "GET"), ctx("s1"))).status).toBe(403);
    expect((await updateShift(req("http://x/api/shifts/s1", "PUT", { status: "CONFIRMED" }), ctx("s1"))).status).toBe(403);
    expect((await deleteShift(req("http://x/api/shifts/s1", "DELETE"), ctx("s1"))).status).toBe(403);
    expect(prismaMock.shift.findMany).not.toHaveBeenCalled();
  });
});

describe("turnos: médico", () => {
  beforeEach(() => asRole("medic"));

  it("el listado se acota a sus turnos aunque pida otro userId", async () => {
    const res = await listShifts(req("http://x/api/shifts?userId=medic-2&year=2026", "GET"));
    expect(res.status).toBe(200);
    expect(prismaMock.shift.findMany.mock.calls[0][0].where.userId).toBe("user-1");
  });

  it("ver, editar o borrar un turno ajeno → 404, sin tocar nada", async () => {
    prismaMock.shift.findUnique.mockResolvedValue(FOREIGN);
    expect((await getShift(req("http://x/api/shifts/s2", "GET"), ctx("s2"))).status).toBe(404);
    expect((await updateShift(req("http://x/api/shifts/s2", "PUT", { status: "CONFIRMED" }), ctx("s2"))).status).toBe(404);
    expect((await deleteShift(req("http://x/api/shifts/s2", "DELETE"), ctx("s2"))).status).toBe(404);
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
    expect(prismaMock.shift.delete).not.toHaveBeenCalled();
  });

  it("su propio turno: ver con paciente reducido (sin consentimiento ni datos de baja), editar y borrar", async () => {
    prismaMock.shift.findUnique.mockResolvedValue({ ...OWN, patient: { id: "p1" }, consultationType: null, user: {} });
    const res = await getShift(req("http://x/api/shifts/s1", "GET"), ctx("s1"));
    expect(res.status).toBe(200);
    const select = prismaMock.shift.findUnique.mock.calls[0][0].include.patient.select;
    expect(Object.keys(select).sort()).toEqual(
      ["birthDate", "dni", "email", "firstName", "id", "lastName", "os", "osNumber", "sex", "telephone"],
    );
    expect(select).not.toHaveProperty("consentType");
    expect(select).not.toHaveProperty("deletedById");

    prismaMock.shift.update.mockResolvedValue({ ...OWN, status: "CONFIRMED" });
    expect((await updateShift(req("http://x/api/shifts/s1", "PUT", { status: "CONFIRMED" }), ctx("s1"))).status).toBe(200);
    prismaMock.shift.delete.mockResolvedValue(OWN);
    expect((await deleteShift(req("http://x/api/shifts/s1", "DELETE"), ctx("s1"))).status).toBe(200);
  });

  it("no puede reasignar su turno a otro profesional ni crear para otro (403)", async () => {
    prismaMock.shift.findUnique.mockResolvedValue(OWN);
    expect((await updateShift(req("http://x/api/shifts/s1", "PUT", { userId: "medic-2" }), ctx("s1"))).status).toBe(403);
    expect((await createShift(req("http://x/api/shifts", "POST", { ...BODY, userId: "medic-2" }))).status).toBe(403);
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
    expect(prismaMock.shift.create).not.toHaveBeenCalled();
  });

  it("crea para sí mismo → 201 con audit CREATE (solo ids)", async () => {
    happyCreate();
    const res = await createShift(req("http://x/api/shifts", "POST", BODY));
    expect(res.status).toBe(201);
    const audit = audits().find((a) => a.action === "CREATE");
    expect(audit).toMatchObject({ resource: "shift", resourceId: "s1", details: { medicId: "user-1", patientId: "p1" } });
  });

  it("editar con paciente inexistente → 404 (antes 500 por FK)", async () => {
    prismaMock.shift.findUnique.mockResolvedValue(OWN);
    prismaMock.patient.findFirst.mockResolvedValue(null);
    const res = await updateShift(req("http://x/api/shifts/s1", "PUT", { patientId: "nope" }), ctx("s1"));
    expect(res.status).toBe(404);
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
  });

  it("series: no crea para otro (403); ver y cancelar se acotan a las propias", async () => {
    expect((await createSeries(req("http://x/api/shifts/recurring", "POST", SERIES_BODY))).status).toBe(403);

    prismaMock.shift.findMany.mockResolvedValue([]);
    expect((await getSeries(req("http://x/api/shifts/recurring/g1", "GET"), groupCtx("g1"))).status).toBe(404);
    expect(prismaMock.shift.findMany.mock.calls[0][0].where).toMatchObject({ recurrenceGroupId: "g1", userId: "user-1" });

    prismaMock.shift.updateMany.mockResolvedValue({ count: 0 });
    expect((await cancelSeries(req("http://x/api/shifts/recurring/g1", "DELETE"), groupCtx("g1"))).status).toBe(404);
    expect(prismaMock.shift.updateMany.mock.calls[0][0].where).toMatchObject({ recurrenceGroupId: "g1", userId: "user-1" });
  });
});

describe("turnos: recepción y admin", () => {
  it.each(["secretary", "admin"])("%s ve, edita, crea y filtra para cualquier profesional", async (role) => {
    asRole(role);
    prismaMock.shift.findUnique.mockResolvedValue({ ...FOREIGN, patient: { id: "p1" }, consultationType: null, user: {} });
    expect((await getShift(req("http://x/api/shifts/s2", "GET"), ctx("s2"))).status).toBe(200);

    prismaMock.shift.update.mockResolvedValue({ ...FOREIGN, status: "CONFIRMED" });
    expect((await updateShift(req("http://x/api/shifts/s2", "PUT", { status: "CONFIRMED" }), ctx("s2"))).status).toBe(200);

    happyCreate("s3");
    expect((await createShift(req("http://x/api/shifts", "POST", { ...BODY, userId: "medic-2" }))).status).toBe(201);

    await listShifts(req("http://x/api/shifts?userId=medic-2", "GET"));
    expect(prismaMock.shift.findMany.mock.calls.at(-1)![0].where.userId).toBe("medic-2");
  });

  it("series de cualquier profesional; cancelar audita", async () => {
    asRole("secretary");
    prismaMock.shift.updateMany.mockResolvedValue({ count: 2 });
    const res = await cancelSeries(req("http://x/api/shifts/recurring/g1", "DELETE"), groupCtx("g1"));
    expect(res.status).toBe(200);
    expect(prismaMock.shift.updateMany.mock.calls[0][0].where).not.toHaveProperty("userId");
    expect(audits()).toContainEqual(expect.objectContaining({ resource: "shift_series", resourceId: "g1", details: { cancelled: 2 } }));
  });
});

describe("llegada del paciente (recepción)", () => {
  it("POST audita; DELETE con turno inexistente → 404 (antes 500)", async () => {
    prismaMock.shift.findUnique.mockResolvedValue({ id: "s1", arrivedAt: null });
    prismaMock.shift.update.mockResolvedValue({ id: "s1", arrivedAt: new Date(), status: "PENDING" });
    expect((await markArrival(new Request("http://x/api/shifts/s1/arrival", { method: "POST" }), ctx("s1"))).status).toBe(200);
    expect(audits()).toContainEqual(expect.objectContaining({ resource: "shift", resourceId: "s1", details: { arrival: true } }));

    prismaMock.shift.findUnique.mockResolvedValue(null);
    expect((await clearArrival(new Request("http://x/api/shifts/nope/arrival", { method: "DELETE" }), ctx("nope"))).status).toBe(404);
    expect(prismaMock.shift.update).toHaveBeenCalledTimes(1);
  });
});
