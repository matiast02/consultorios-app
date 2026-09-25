import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import {
  canAccessEntry,
  canReadEntry,
  effectiveGrantStatus,
  findActiveGrant,
  grantCoversEntry,
  grantPermissions,
  isGrantActive,
  listScopeFromGrant,
  readScopeForList,
  recordSections,
  recordVisibleFields,
  RECORD_BASE_FIELDS,
  type ActiveGrant,
  type ClinicalActor,
} from "@/lib/clinical-access";

const DAY = 24 * 60 * 60 * 1000;
const medic: ClinicalActor = { userId: "m1", role: "medic", isAdmin: false, isMedic: true };
const admin: ClinicalActor = { userId: "a1", role: "admin", isAdmin: true, isMedic: false };

/** Fila de ClinicalAccessGrant tal como la devuelve el select de findActiveGrant. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  patientId: "p1",
  status: "ACTIVE",
  scope: "FULL",
  sections: null,
  entryIds: null,
  startsAt: new Date(Date.now() - DAY),
  expiresAt: new Date(Date.now() + DAY),
  ...over,
});

const grant = (over: Partial<ActiveGrant> = {}): ActiveGrant => ({
  id: "g1",
  patientId: "p1",
  scope: "PARTIAL",
  sections: [],
  entryIds: [],
  startsAt: new Date(Date.now() - DAY),
  expiresAt: new Date(Date.now() + DAY),
  ...over,
});

beforeEach(() => {
  resetAllMocks();
});

describe("findActiveGrant", () => {
  it("consulta solo ACTIVE dentro de la ventana startsAt ≤ now < expiresAt", async () => {
    await findActiveGrant("m1", "p1");
    const where = prismaMock.clinicalAccessGrant.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ grantedToUserId: "m1", patientId: "p1", status: "ACTIVE" });
    expect(where.startsAt.lte).toBeInstanceOf(Date);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("sin paciente o sin usuario → null sin consultar", async () => {
    expect(await findActiveGrant("m1", undefined)).toBeNull();
    expect(await findActiveGrant("", "p1")).toBeNull();
    expect(prismaMock.clinicalAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("PARTIAL: parsea secciones (descarta inválidas) y entryIds", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(
      row({
        scope: "PARTIAL",
        sections: JSON.stringify(["antecedentes", "hackeo", "recetas", 3]),
        entryIds: JSON.stringify(["e1", 7, "e2"]),
      }),
    );
    const g = await findActiveGrant("m1", "p1");
    expect(g).toMatchObject({ id: "g1", scope: "PARTIAL", sections: ["antecedentes", "recetas"], entryIds: ["e1", "e2"] });
  });

  it("FULL: ignora sections/entryIds; JSON corrupto → []", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(
      row({ scope: "FULL", sections: "{no-json", entryIds: JSON.stringify(["e1"]) }),
    );
    expect(await findActiveGrant("m1", "p1")).toMatchObject({ scope: "FULL", sections: [], entryIds: [] });

    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(row({ scope: "PARTIAL", sections: "{no-json" }));
    expect((await findActiveGrant("m1", "p1"))?.sections).toEqual([]);
  });

  it("defensa en profundidad: fila vencida, futura, no ACTIVE o de otro paciente → null", async () => {
    for (const bad of [
      row({ expiresAt: new Date(Date.now() - 1000) }),
      row({ startsAt: new Date(Date.now() + DAY) }),
      row({ status: "REVOKED" }),
      row({ patientId: "otro" }),
      row({ startsAt: null }),
    ]) {
      prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(bad);
      expect(await findActiveGrant("m1", "p1")).toBeNull();
    }
  });
});

describe("estado efectivo / vigencia", () => {
  it("ACTIVE vencida se informa EXPIRED y no está vigente", () => {
    const past = new Date(Date.now() - 1000);
    expect(effectiveGrantStatus({ status: "ACTIVE", expiresAt: past })).toBe("EXPIRED");
    expect(isGrantActive({ status: "ACTIVE", startsAt: new Date(0), expiresAt: past })).toBe(false);
    expect(effectiveGrantStatus({ status: "ACTIVE", expiresAt: new Date(Date.now() + DAY) })).toBe("ACTIVE");
    expect(effectiveGrantStatus({ status: "PENDING", expiresAt: null })).toBe("PENDING");
  });
});

describe("grantCoversEntry", () => {
  it("FULL cubre todo; PARTIAL por sección o por id", () => {
    expect(grantCoversEntry(grant({ scope: "FULL" }), "meal_plan", "x")).toBe(true);
    const g = grant({ sections: ["evoluciones"], entryIds: ["rx9"] });
    expect(grantCoversEntry(g, "evolution", "cualquiera")).toBe(true);
    expect(grantCoversEntry(g, "prescription", "rx9")).toBe(true);
    expect(grantCoversEntry(g, "prescription", "rx1")).toBe(false);
    expect(grantCoversEntry(g, "study_order", "so1")).toBe(false);
  });

  it("las secciones de ficha (antecedentes/alergias/medicacion) no cubren asientos", () => {
    const g = grant({ sections: ["antecedentes", "alergias", "medicacion"] });
    for (const kind of ["evolution", "prescription", "study_order", "meal_plan"] as const) {
      expect(grantCoversEntry(g, kind, "x")).toBe(false);
    }
  });
});

describe("canReadEntry", () => {
  const foreign = { id: "e1", userId: "otro" };

  it("admin y autor: sí, sin buscar concesión ni grantId", async () => {
    expect(await canReadEntry(admin, foreign, "p1", "evolution")).toEqual({ ok: true });
    expect(await canReadEntry(medic, { id: "e1", userId: "m1" }, "p1", "evolution")).toEqual({ ok: true });
    expect(prismaMock.clinicalAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("ajeno sin concesión → no", async () => {
    expect(await canReadEntry(medic, foreign, "p1", "evolution")).toEqual({ ok: false });
  });

  it("ajeno sin patientId (asiento huérfano) → no, sin consultar", async () => {
    expect(await canReadEntry(medic, foreign, undefined, "evolution")).toEqual({ ok: false });
    expect(prismaMock.clinicalAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("concesión FULL → sí, con grantId (para auditar)", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(row({ id: "gFull" }));
    expect(await canReadEntry(medic, foreign, "p1", "study_order")).toEqual({ ok: true, grantId: "gFull" });
  });

  it("PARTIAL: cubre la sección del tipo o el id listado; nada más", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(
      row({ scope: "PARTIAL", sections: JSON.stringify(["recetas"]), entryIds: JSON.stringify(["e7"]) }),
    );
    expect((await canReadEntry(medic, { id: "rx1", userId: "otro" }, "p1", "prescription")).ok).toBe(true);
    expect((await canReadEntry(medic, { id: "e7", userId: "otro" }, "p1", "evolution")).ok).toBe(true);
    expect((await canReadEntry(medic, { id: "e8", userId: "otro" }, "p1", "evolution")).ok).toBe(false);
    expect((await canReadEntry(medic, { id: "mp1", userId: "otro" }, "p1", "meal_plan")).ok).toBe(false);
  });

  it("la concesión se busca sobre el paciente DUEÑO del asiento", async () => {
    await canReadEntry(medic, foreign, "p2", "evolution");
    expect(prismaMock.clinicalAccessGrant.findFirst.mock.calls[0][0].where.patientId).toBe("p2");
  });

  it("canAccessEntry (escritura) ignora concesiones", () => {
    expect(canAccessEntry(medic, foreign)).toBe(false);
    expect(canAccessEntry(admin, foreign)).toBe(true);
  });
});

describe("readScopeForList / listScopeFromGrant", () => {
  it("admin → {} sin consultar", async () => {
    expect(await readScopeForList(admin, "p1", "evolution")).toEqual({ where: {} });
    expect(prismaMock.clinicalAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("médico sin concesión → solo propios", async () => {
    expect(await readScopeForList(medic, "p1", "prescription")).toEqual({ where: { userId: "m1" } });
  });

  it("FULL o sección que cubre el tipo → sin filtro de autor + grantId", () => {
    expect(listScopeFromGrant(medic, grant({ scope: "FULL" }), "meal_plan")).toEqual({ where: {}, grantId: "g1" });
    expect(listScopeFromGrant(medic, grant({ sections: ["estudios"] }), "study_order")).toEqual({
      where: {},
      grantId: "g1",
    });
  });

  it("PARTIAL con entryIds pero sin la sección → propios OR ids listados", () => {
    expect(listScopeFromGrant(medic, grant({ sections: ["recetas"], entryIds: ["e1", "e2"] }), "evolution")).toEqual({
      where: { OR: [{ userId: "m1" }, { id: { in: ["e1", "e2"] } }] },
      grantId: "g1",
    });
  });

  it("PARTIAL que no cubre el tipo ni lista ids → solo propios, sin grantId", () => {
    expect(listScopeFromGrant(medic, grant({ sections: ["antecedentes"] }), "evolution")).toEqual({
      where: { userId: "m1" },
    });
  });

  it("readScopeForList usa la concesión vigente de la DB", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(
      row({ scope: "PARTIAL", sections: JSON.stringify(["evoluciones"]) }),
    );
    expect(await readScopeForList(medic, "p1", "evolution")).toEqual({ where: {}, grantId: "g1" });
    expect(await readScopeForList(medic, "p1", "prescription")).toEqual({ where: { userId: "m1" } });
  });
});

describe("recordSections / recordVisibleFields", () => {
  it("admin → ficha completa, sin consultar", async () => {
    const a = await recordSections(admin, "p1");
    expect(a).toMatchObject({ full: true, hasRelationship: true, grant: null });
    expect(a.grantId).toBeUndefined();
    expect(prismaMock.clinicalAccessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("tratante → completa y editable, sin grantId", async () => {
    prismaMock.studyOrder.count.mockResolvedValue(2);
    const a = await recordSections(medic, "p1");
    expect(a).toMatchObject({ full: true, hasRelationship: true });
    expect(a.sections).toEqual(["antecedentes", "alergias", "medicacion"]);
    expect(a.grantId).toBeUndefined();
  });

  it("concesión FULL → completa de solo lectura + grantId", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(row());
    expect(await recordSections(medic, "p1")).toMatchObject({ full: true, hasRelationship: false, grantId: "g1" });
  });

  it("PARTIAL → solo las secciones de ficha listadas", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(
      row({ scope: "PARTIAL", sections: JSON.stringify(["antecedentes", "recetas"]) }),
    );
    const a = await recordSections(medic, "p1");
    expect(a).toMatchObject({ full: false, sections: ["antecedentes"], grantId: "g1" });
    const fields = recordVisibleFields(a)!;
    expect(fields).toEqual(
      expect.arrayContaining([...RECORD_BASE_FIELDS, "personalHistory", "familyHistory", "habitsTobacco", "habitsDiet"]),
    );
    for (const hidden of ["allergies", "currentMedication", "notes", "bloodType", "customFields", "odontogram", "weightKg"]) {
      expect(fields).not.toContain(hidden);
    }
  });

  it("PARTIAL solo con asientos → ficha base, sin grantId de ficha (sí concesión para listados)", async () => {
    prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue(
      row({ scope: "PARTIAL", sections: JSON.stringify(["evoluciones"]) }),
    );
    const a = await recordSections(medic, "p1");
    expect(a).toMatchObject({ full: false, sections: [] });
    expect(a.grantId).toBeUndefined();
    expect(a.grant?.id).toBe("g1");
  });

  it("nada → vista base (solo alergias estructuradas)", async () => {
    const a = await recordSections(medic, "p1");
    expect(a).toMatchObject({ full: false, sections: [], hasRelationship: false, grant: null });
    expect(recordVisibleFields(a)).toEqual([...RECORD_BASE_FIELDS]);
    expect(recordVisibleFields({ full: true, sections: [] })).toBeNull();
  });

  it("alergias → allergies + structuredAllergies; medicacion → currentMedication", () => {
    expect(recordVisibleFields({ full: false, sections: ["alergias"] })).toContain("allergies");
    expect(recordVisibleFields({ full: false, sections: ["medicacion"] })).toContain("currentMedication");
  });
});

describe("grantPermissions", () => {
  const pending = { status: "PENDING" as const, grantedToUserId: "otro", decidedById: null };
  const active = { status: "ACTIVE" as const, grantedToUserId: "otro", decidedById: "aprobador" };

  it("tratante decide y revoca; no-tratante no", () => {
    expect(grantPermissions(medic, pending, true)).toEqual({ approve: true, reject: true, revoke: false, cancel: false });
    expect(grantPermissions(medic, pending, false)).toEqual({ approve: false, reject: false, revoke: false, cancel: false });
    expect(grantPermissions(medic, active, true).revoke).toBe(true);
    expect(grantPermissions(medic, active, false).revoke).toBe(false);
  });

  it("quien la aprobó puede revocar aunque ya no sea tratante", () => {
    expect(grantPermissions({ ...medic, userId: "aprobador" }, active, false).revoke).toBe(true);
  });

  it("admin decide y revoca siempre", () => {
    expect(grantPermissions(admin, pending, false)).toMatchObject({ approve: true, reject: true });
    expect(grantPermissions(admin, active, false).revoke).toBe(true);
  });

  it("beneficiario: solo cancelar (aunque sea tratante)", () => {
    const own = { ...pending, grantedToUserId: "m1" };
    expect(grantPermissions(medic, own, true)).toEqual({ approve: false, reject: false, revoke: false, cancel: true });
    expect(grantPermissions(medic, { ...active, grantedToUserId: "m1" }, true)).toMatchObject({ revoke: false, cancel: true });
  });

  it("estados finales o vencidos: nada", () => {
    for (const status of ["REJECTED", "REVOKED", "EXPIRED"] as const) {
      expect(grantPermissions(admin, { ...active, status }, true)).toEqual({
        approve: false,
        reject: false,
        revoke: false,
        cancel: false,
      });
    }
  });
});
