// Rutas clínicas bajo una concesión vigente (ClinicalAccessGrant): el
// beneficiario lee dentro del alcance, nunca escribe, y cada lectura se audita
// con VIEW_SENSITIVE + details.grantId.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { checkModuleAccess } from "@/lib/modules";
import { logAudit } from "@/lib/audit";

vi.mock("@/lib/modules", () => ({ checkModuleAccess: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GET as listEvolutions } from "@/app/api/patients/[id]/evolutions/route";
import {
  GET as getEvolution,
  PUT as putEvolution,
  DELETE as delEvolution,
} from "@/app/api/patients/[id]/evolutions/[evolutionId]/route";
import { GET as getRecord, PUT as putRecord } from "@/app/api/patients/[id]/clinical-record/route";
import { GET as listPrescriptions } from "@/app/api/prescriptions/route";
import { GET as getPrescription, DELETE as delPrescription } from "@/app/api/prescriptions/[id]/route";
import { GET as getStudyOrder } from "@/app/api/study-orders/[id]/route";
import { GET as getMealPlan } from "@/app/api/meal-plans/[id]/route";
import { GET as getLedger } from "@/app/api/clinical-ledger/route";

const DAY = 24 * 60 * 60 * 1000;
const FOREIGN = { userId: "treating-medic" };

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
const patientCtx = { params: Promise.resolve({ id: "p1" }) };
const evoCtx = { params: Promise.resolve({ id: "p1", evolutionId: "e1" }) };
const idCtx = { params: Promise.resolve({ id: "x1" }) };

/** El médico de la sesión (user-1, sin asientos propios) tiene esta concesión. */
function withGrant(scope: "FULL" | "PARTIAL", sections: string[] = [], entryIds: string[] = [], over = {}) {
  prismaMock.clinicalAccessGrant.findFirst.mockResolvedValue({
    id: "g1",
    patientId: "p1",
    status: "ACTIVE",
    scope,
    sections: sections.length ? JSON.stringify(sections) : null,
    entryIds: entryIds.length ? JSON.stringify(entryIds) : null,
    startsAt: new Date(Date.now() - DAY),
    expiresAt: new Date(Date.now() + DAY),
    ...over,
  });
}

const sensitiveAudit = () => vi.mocked(logAudit).mock.calls.find((c) => c[0].action === "VIEW_SENSITIVE")?.[0];

beforeEach(() => {
  resetAllMocks();
  vi.mocked(checkModuleAccess).mockResolvedValue(true);
  vi.mocked(getUserRole).mockResolvedValue("medic");
  prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
  prismaMock.clinicalRecord.findUnique.mockResolvedValue({ id: "cr1", patientId: "p1" });
});

describe("evoluciones bajo concesión", () => {
  it("lista con FULL → todas las del paciente + audit con grantId", async () => {
    withGrant("FULL");
    await listEvolutions(req("http://x/api/patients/p1/evolutions"), patientCtx);
    expect(prismaMock.evolution.findMany.mock.calls[0][0].where).toEqual({ clinicalRecordId: "cr1" });
    expect(sensitiveAudit()?.details).toMatchObject({ list: true, grantId: "g1" });
  });

  it("lista con asientos puntuales + búsqueda → OR del alcance preservado bajo AND", async () => {
    withGrant("PARTIAL", ["recetas"], ["e1"]);
    await listEvolutions(req("http://x/api/patients/p1/evolutions?search=hta"), patientCtx);
    const where = prismaMock.evolution.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ userId: "user-1" }, { id: { in: ["e1"] } }]);
    expect(where.AND[0].OR).toHaveLength(3);
  });

  it("individual ajena: FULL → 200 + grantId; PARTIAL sin evoluciones → 404", async () => {
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", ...FOREIGN });
    withGrant("FULL");
    expect((await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx)).status).toBe(200);
    expect(sensitiveAudit()?.details).toEqual({ patientId: "p1", grantId: "g1" });

    withGrant("PARTIAL", ["recetas"]);
    expect((await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx)).status).toBe(404);
  });

  it("concesión vencida (aunque siga ACTIVE en la DB) → sin acceso", async () => {
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", ...FOREIGN });
    withGrant("FULL", [], [], { expiresAt: new Date(Date.now() - 1000) });
    expect((await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx)).status).toBe(404);
  });

  it("nunca edita ni anula asientos ajenos, aun con FULL", async () => {
    withGrant("FULL");
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", ...FOREIGN, annulledAt: null });
    const put = await putEvolution(req("http://x/api/patients/p1/evolutions/e1", "PUT", { diagnosis: "x" }), evoCtx);
    const del = await delEvolution(req("http://x/api/patients/p1/evolutions/e1", "DELETE", { annulReason: "x" }), evoCtx);
    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
    expect(prismaMock.evolution.update).not.toHaveBeenCalled();
  });
});

describe("ficha (clinical-record) bajo concesión", () => {
  const RECORD = {
    id: "cr1",
    patientId: "p1",
    structuredAllergies: JSON.stringify([{ nombre: "Penicilina", severidad: "alta" }]),
    allergies: "Penicilina",
    personalHistory: "HTA",
    familyHistory: "DBT madre",
    habitsTobacco: "No fuma",
    currentMedication: "Enalapril",
    notes: "nota privada",
    bloodType: "0+",
    customFields: "{}",
    createdAt: new Date(),
    updatedAt: new Date(),
    evolutions: [],
  };
  const url = "http://x/api/patients/p1/clinical-record";

  it("PARTIAL antecedentes → lista blanca: antecedentes + base; el resto null; audit con grantId", async () => {
    withGrant("PARTIAL", ["antecedentes"]);
    prismaMock.clinicalRecord.upsert.mockResolvedValue(RECORD);
    const res = await getRecord(req(url), patientCtx);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ personalHistory: "HTA", familyHistory: "DBT madre", habitsTobacco: "No fuma" });
    expect(data.structuredAllergies).toBe(RECORD.structuredAllergies);
    for (const hidden of ["allergies", "currentMedication", "notes", "bloodType", "customFields"]) {
      expect(data[hidden]).toBeNull();
    }
    const select = prismaMock.clinicalRecord.upsert.mock.calls[0][0].select;
    expect(select.personalHistory).toBe(true);
    expect(select.notes).toBeUndefined();
    expect(sensitiveAudit()).toMatchObject({ resource: "clinical_record", details: { patientId: "p1", grantId: "g1" } });
  });

  it("PARTIAL solo evoluciones → ficha base + evoluciones de todos los autores", async () => {
    withGrant("PARTIAL", ["evoluciones"]);
    prismaMock.clinicalRecord.upsert.mockResolvedValue(RECORD);
    prismaMock.evolution.findMany.mockResolvedValue([{ id: "e1", ...FOREIGN }]);
    const { data } = await (await getRecord(req(url), patientCtx)).json();
    expect(data.personalHistory).toBeNull();
    expect(data.evolutions).toHaveLength(1);
    expect(prismaMock.evolution.findMany.mock.calls[0][0].where).toEqual({ clinicalRecordId: "cr1" });
    expect(sensitiveAudit()?.details).toMatchObject({ grantId: "g1" });
  });

  it("FULL → ficha completa (solo lectura: PUT sigue 403)", async () => {
    withGrant("FULL");
    prismaMock.clinicalRecord.upsert.mockResolvedValue(RECORD);
    const { data } = await (await getRecord(req(url), patientCtx)).json();
    expect(data.notes).toBe("nota privada");
    expect(prismaMock.clinicalRecord.upsert.mock.calls[0][0].include.evolutions.where).toEqual({});
    expect(sensitiveAudit()?.details).toMatchObject({ grantId: "g1" });

    vi.mocked(logAudit).mockClear();
    prismaMock.clinicalRecord.upsert.mockClear();
    const put = await putRecord(req(url, "PUT", { notes: "x" }), patientCtx);
    expect(put.status).toBe(403);
    expect(prismaMock.clinicalRecord.upsert).not.toHaveBeenCalled();
  });
});

describe("recetas / órdenes / planes bajo concesión", () => {
  it("receta ajena con sección recetas → 200 + grantId; lista sin filtro de autor", async () => {
    withGrant("PARTIAL", ["recetas"]);
    prismaMock.prescription.findUnique.mockResolvedValue({ id: "x1", patientId: "p1", ...FOREIGN });
    expect((await getPrescription(req("http://x/api/prescriptions/x1"), idCtx)).status).toBe(200);
    expect(sensitiveAudit()?.details).toEqual({ patientId: "p1", grantId: "g1" });

    await listPrescriptions(req("http://x/api/prescriptions?patientId=p1"));
    expect(prismaMock.prescription.findMany.mock.calls[0][0].where).toEqual({ patientId: "p1" });
  });

  it("la concesión se evalúa sobre el paciente de la receta, no sobre otro", async () => {
    withGrant("FULL");
    prismaMock.prescription.findUnique.mockResolvedValue({ id: "x1", patientId: "p2", ...FOREIGN });
    await getPrescription(req("http://x/api/prescriptions/x1"), idCtx);
    expect(prismaMock.clinicalAccessGrant.findFirst.mock.calls[0][0].where.patientId).toBe("p2");
  });

  it("no puede anular recetas ajenas aunque tenga concesión", async () => {
    withGrant("FULL");
    prismaMock.prescription.findUnique.mockResolvedValue({ id: "x1", patientId: "p1", ...FOREIGN, annulledAt: null });
    const res = await delPrescription(req("http://x/api/prescriptions/x1", "DELETE", { annulReason: "x" }), idCtx);
    expect(res.status).toBe(404);
    expect(prismaMock.prescription.update).not.toHaveBeenCalled();
  });

  it("orden ajena con estudios → 200; plan ajeno sin planes → 404", async () => {
    withGrant("PARTIAL", ["estudios"]);
    prismaMock.studyOrder.findUnique.mockResolvedValue({ id: "x1", patientId: "p1", ...FOREIGN });
    expect((await getStudyOrder(req("http://x/api/study-orders/x1"), idCtx)).status).toBe(200);
    prismaMock.mealPlan.findUnique.mockResolvedValue({ id: "x1", patientId: "p1", ...FOREIGN });
    expect((await getMealPlan(req("http://x/api/meal-plans/x1"), idCtx)).status).toBe(404);
  });
});

describe("ledger bajo concesión", () => {
  const ledgerUrl = (t: string) => `http://x/api/clinical-ledger?entityType=${t}&entityId=x1`;

  it("historial de la ficha: PARTIAL → 404 (snapshots completos); FULL → 200 + grantId", async () => {
    prismaMock.clinicalRecord.findUnique.mockResolvedValue({ patientId: "p1" });
    withGrant("PARTIAL", ["antecedentes", "alergias", "medicacion"]);
    expect((await getLedger(req(ledgerUrl("clinical_record")))).status).toBe(404);

    withGrant("FULL");
    expect((await getLedger(req(ledgerUrl("clinical_record")))).status).toBe(200);
    expect(sensitiveAudit()?.details).toMatchObject({ entityType: "clinical_record", grantId: "g1" });
  });

  it("historial de un asiento puntual concedido → 200", async () => {
    withGrant("PARTIAL", [], ["x1"]);
    prismaMock.evolution.findUnique.mockResolvedValue({ id: "x1", ...FOREIGN, clinicalRecord: { patientId: "p1" } });
    expect((await getLedger(req(ledgerUrl("evolution")))).status).toBe(200);
  });
});
