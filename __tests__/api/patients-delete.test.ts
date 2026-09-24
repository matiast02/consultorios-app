import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, authMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { DELETE as deletePatient } from "@/app/api/patients/[id]/route";
import { POST as createPatient } from "@/app/api/patients/route";
import { POST as restorePatient } from "@/app/api/patients/[id]/restore/route";

const ctx = { params: Promise.resolve({ id: "p1" }) };
const del = (mode?: string) =>
  deletePatient(
    new NextRequest(`http://x/api/patients/p1${mode ? `?mode=${mode}` : ""}`, { method: "DELETE" }),
    ctx
  );

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 7 * 24 * 3600 * 1000);

function asActor(id: string, role: string | null) {
  authMock.mockResolvedValue({ user: { id, email: `${id}@x.com`, role } });
  vi.mocked(getUserRole).mockResolvedValue(role);
}

function givenPatient(createdById: string | null = "medic-1") {
  prismaMock.patient.findFirst.mockResolvedValue({ id: "p1", createdById });
}

beforeEach(() => {
  resetAllMocks();
  prismaMock.user.findMany.mockResolvedValue([
    { id: "medic-2", name: "", firstName: "Ana", lastName: "Pérez" },
  ]);
});

describe("DELETE /api/patients/[id] — validación básica", () => {
  it("mode inválido → 400", async () => {
    asActor("admin-1", "admin");
    const res = await del("nuke");
    expect(res.status).toBe(400);
  });

  it("paciente inexistente o ya archivado → 404", async () => {
    asActor("admin-1", "admin");
    const res = await del("purge");
    expect(res.status).toBe(404);
  });

  it("default es archive (secretaria → 403)", async () => {
    asActor("sec-1", "secretary");
    givenPatient();
    const res = await del();
    expect(res.status).toBe(403);
    expect(prismaMock.patient.update).not.toHaveBeenCalled();
  });
});

describe("DELETE ?mode=purge", () => {
  it("médico que no lo creó → 403", async () => {
    asActor("medic-9", "medic");
    givenPatient("medic-1");
    const res = await del("purge");
    expect(res.status).toBe(403);
    expect(prismaMock.patient.delete).not.toHaveBeenCalled();
  });

  it("médico creador, sin asientos, solo turnos propios → borra", async () => {
    asActor("medic-1", "medic");
    givenPatient("medic-1");
    prismaMock.shift.findMany.mockResolvedValue([{ userId: "medic-1", start: FUTURE }]);
    const res = await del("purge");
    expect(res.status).toBe(200);
    expect(prismaMock.patient.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", resource: "patient", details: { mode: "purge" } })
    );
  });

  it("médico creador con turno pasado de otro profesional → 409, no puede archivar", async () => {
    asActor("medic-1", "medic");
    givenPatient("medic-1");
    prismaMock.shift.findMany.mockResolvedValue([{ userId: "medic-2", start: PAST }]);
    const res = await del("purge");
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("PURGE_BLOCKED");
    expect(json.blockers).toEqual({
      clinicalEntries: 0,
      otherProfessionals: [{ id: "medic-2", name: "Ana Pérez" }],
      futureShiftsWithOthers: 0,
      canArchive: false,
    });
    expect(prismaMock.patient.delete).not.toHaveBeenCalled();
  });

  it("secretaria con turno no cancelado (aunque sea pasado) → 409", async () => {
    asActor("sec-1", "secretary");
    givenPatient();
    prismaMock.shift.findMany.mockResolvedValue([{ userId: "medic-2", start: PAST }]);
    const res = await del("purge");
    expect(res.status).toBe(409);
    expect((await res.json()).blockers.canArchive).toBe(false);
  });

  it("secretaria: no se revela la autoría de asientos clínicos", async () => {
    asActor("sec-1", "secretary");
    givenPatient();
    prismaMock.evolution.findMany.mockResolvedValue([{ id: "e1", userId: "medic-2" }]);
    const res = await del("purge");
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.blockers.clinicalEntries).toBe(1);
    expect(json.blockers.otherProfessionals).toEqual([]);
  });

  it("admin con historia clínica → 409 con canArchive=true", async () => {
    asActor("admin-1", "admin");
    givenPatient();
    prismaMock.evolution.findMany.mockResolvedValue([{ id: "e1", userId: "medic-2" }]);
    // misma evolución en el ledger + una versión de la ficha → 2 asientos distintos
    prismaMock.clinicalEntryVersion.findMany.mockResolvedValue([
      { entityType: "evolution", entityId: "e1", authorId: "medic-2" },
      { entityType: "clinical_record", entityId: "cr1", authorId: "medic-2" },
    ]);
    const res = await del("purge");
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.blockers.clinicalEntries).toBe(2);
    expect(json.blockers.canArchive).toBe(true);
  });

  it("asientos solo en el ledger también bloquean", async () => {
    asActor("medic-1", "medic");
    givenPatient("medic-1");
    prismaMock.clinicalEntryVersion.findMany.mockResolvedValue([
      { entityType: "prescription", entityId: "rx1", authorId: "medic-1" },
    ]);
    const res = await del("purge");
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.blockers.clinicalEntries).toBe(1);
    // asiento propio, sin otros profesionales → el médico creador puede archivar
    expect(json.blockers.canArchive).toBe(true);
  });
});

describe("DELETE ?mode=archive", () => {
  it("médico que no lo creó → 403", async () => {
    asActor("medic-9", "medic");
    givenPatient("medic-1");
    const res = await del("archive");
    expect(res.status).toBe(403);
  });

  it("médico creador con evolución de otro profesional → 409", async () => {
    asActor("medic-1", "medic");
    givenPatient("medic-1");
    prismaMock.evolution.findMany.mockResolvedValue([{ id: "e1", userId: "medic-2" }]);
    const res = await del("archive");
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("ARCHIVE_BLOCKED");
    expect(prismaMock.patient.update).not.toHaveBeenCalled();
  });

  it("médico creador con asientos propios → archiva con deletedById", async () => {
    asActor("medic-1", "medic");
    givenPatient("medic-1");
    prismaMock.evolution.findMany.mockResolvedValue([{ id: "e1", userId: "medic-1" }]);
    const res = await del("archive");
    expect(res.status).toBe(200);
    expect(prismaMock.patient.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { deletedAt: expect.any(Date), deletedById: "medic-1" },
    });
  });

  it("admin con asientos de otros → archiva y devuelve warnings", async () => {
    asActor("admin-1", "admin");
    givenPatient();
    prismaMock.evolution.findMany.mockResolvedValue([{ id: "e1", userId: "medic-2" }]);
    prismaMock.shift.findMany.mockResolvedValue([{ userId: "medic-2", start: PAST }]);
    const res = await del("archive");
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.mode).toBe("archive");
    expect(json.data.otherProfessionals).toEqual([{ id: "medic-2", name: "Ana Pérez" }]);
    expect(json.data.warnings.join(" ")).toContain("Ana Pérez");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { mode: "archive", otherProfessionalIds: ["medic-2"] },
      })
    );
  });

  it("turno FUTURO con otro profesional bloquea incluso al admin", async () => {
    asActor("admin-1", "admin");
    givenPatient();
    prismaMock.shift.findMany.mockResolvedValue([{ userId: "medic-2", start: FUTURE }]);
    const res = await del("archive");
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("ARCHIVE_BLOCKED");
    expect(json.blockers.futureShiftsWithOthers).toBe(1);
    expect(prismaMock.patient.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/patients — DNI y autoría", () => {
  const body = { firstName: "Juan", lastName: "Gómez", birthDate: "1990-01-01", sex: "M", dni: "30111222" };
  const post = () =>
    createPatient(
      new NextRequest("http://x/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  it("DNI de paciente archivado → 409 ARCHIVED_DUPLICATE", async () => {
    asActor("sec-1", "secretary");
    prismaMock.patient.findFirst.mockResolvedValue({ id: "old", deletedAt: new Date() });
    const res = await post();
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "ARCHIVED_DUPLICATE", archivedPatientId: "old" });
  });

  it("DNI de paciente activo → 409 DUPLICATE", async () => {
    asActor("sec-1", "secretary");
    prismaMock.patient.findFirst.mockResolvedValue({ id: "other", deletedAt: null });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE");
  });

  it("setea createdById con el usuario de la sesión", async () => {
    asActor("medic-1", "medic");
    prismaMock.patient.create.mockResolvedValue({ id: "new" });
    const res = await post();
    expect(res.status).toBe(201);
    expect(prismaMock.patient.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: "medic-1" }) })
    );
  });
});

describe("POST /api/patients/[id]/restore", () => {
  const restore = () =>
    restorePatient(new NextRequest("http://x/api/patients/p1/restore", { method: "POST" }), ctx);

  it("no admin → 403", async () => {
    asActor("medic-1", "medic");
    const res = await restore();
    expect(res.status).toBe(403);
  });

  it("admin restaura y audita", async () => {
    asActor("admin-1", "admin");
    prismaMock.patient.findUnique.mockResolvedValue({ id: "p1", dni: "1", deletedAt: new Date() });
    prismaMock.patient.update.mockResolvedValue({ id: "p1" });
    const res = await restore();
    expect(res.status).toBe(200);
    expect(prismaMock.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: null, deletedById: null } })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", details: { restored: true } })
    );
  });

  it("DNI en uso por un paciente activo → 409", async () => {
    asActor("admin-1", "admin");
    prismaMock.patient.findUnique.mockResolvedValue({ id: "p1", dni: "1", deletedAt: new Date() });
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p2" });
    const res = await restore();
    expect(res.status).toBe(409);
    expect(prismaMock.patient.update).not.toHaveBeenCalled();
  });

  it("paciente no archivado → 409 NOT_ARCHIVED", async () => {
    asActor("admin-1", "admin");
    prismaMock.patient.findUnique.mockResolvedValue({ id: "p1", dni: "1", deletedAt: null });
    const res = await restore();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_ARCHIVED");
  });
});
