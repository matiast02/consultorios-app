import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock, resetAllMocks } from "../setup";
import { getUserRole } from "@/lib/auth-utils";
import { checkModuleAccess } from "@/lib/modules";
import { logAudit } from "@/lib/audit";

vi.mock("@/lib/modules", () => ({
  checkModuleAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GET as getEvolution, DELETE as delEvolution } from "@/app/api/patients/[id]/evolutions/[evolutionId]/route";
import { GET as listEvolutions } from "@/app/api/patients/[id]/evolutions/route";
import {
  GET as getClinicalRecord,
  PUT as putClinicalRecord,
} from "@/app/api/patients/[id]/clinical-record/route";
import { GET as getLedger } from "@/app/api/clinical-ledger/route";
import { GET as listPrescriptions } from "@/app/api/prescriptions/route";
import { GET as getPrescription } from "@/app/api/prescriptions/[id]/route";
import {
  GET as getMealPlan,
  PUT as putMealPlan,
} from "@/app/api/meal-plans/[id]/route";
import {
  GET as getStudyOrder,
  PUT as putStudyOrder,
  DELETE as delStudyOrder,
} from "@/app/api/study-orders/[id]/route";

type Role = "medic" | "admin" | "secretary" | null;
const asRole = (role: Role) => vi.mocked(getUserRole).mockResolvedValue(role);

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });

const evoCtx = { params: Promise.resolve({ id: "p1", evolutionId: "e1" }) };
const idCtx = { params: Promise.resolve({ id: "x1" }) };
const patientCtx = { params: Promise.resolve({ id: "p1" }) };

// La sesión mockeada es "user-1".
const OWN = { userId: "user-1" };
const FOREIGN = { userId: "other-medic" };

beforeEach(() => {
  resetAllMocks();
  vi.mocked(checkModuleAccess).mockResolvedValue(true);
});

// ── Evolution single GET — must not leak clinical data ────────────────────────
describe("IDOR: GET evolution [evolutionId]", () => {
  it("secretaria → 403 (dato clínico)", async () => {
    asRole("secretary");
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(403);
    expect(prismaMock.evolution.findFirst).not.toHaveBeenCalled();
  });

  it("usuario sin rol → 403 (lista blanca)", async () => {
    asRole(null);
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(403);
  });

  it("médico que no es el autor → 404 (scope por médico)", async () => {
    asRole("medic");
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
    // Scoped query (userId filter) finds nothing → not the author
    prismaMock.evolution.findFirst.mockResolvedValue(null);
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(404);
    expect(prismaMock.evolution.findFirst.mock.calls[0][0].where.userId).toBe("user-1");
  });

  it("médico autor → 200 + VIEW_SENSITIVE", async () => {
    asRole("medic");
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", ...OWN });
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "evolution", resourceId: "e1" })
    );
  });

  it("admin → 200 (ve todo)", async () => {
    asRole("admin");
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", ...FOREIGN });
    const res = await getEvolution(req("http://x/api/patients/p1/evolutions/e1"), evoCtx);
    expect(res.status).toBe(200);
    expect(prismaMock.evolution.findFirst.mock.calls[0][0].where.userId).toBeUndefined();
  });
});

// ── Evolutions list — scope por autor ─────────────────────────────────────────
describe("GET evolutions (lista)", () => {
  beforeEach(() => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.clinicalRecord.findUnique.mockResolvedValue({ id: "cr1", patientId: "p1" });
  });

  it("secretaria → 403", async () => {
    asRole("secretary");
    const res = await listEvolutions(req("http://x/api/patients/p1/evolutions"), patientCtx);
    expect(res.status).toBe(403);
  });

  it("médico → solo sus evoluciones + VIEW_SENSITIVE por paciente", async () => {
    asRole("medic");
    const res = await listEvolutions(req("http://x/api/patients/p1/evolutions"), patientCtx);
    expect(res.status).toBe(200);
    expect(prismaMock.evolution.findMany.mock.calls[0][0].where).toEqual({
      clinicalRecordId: "cr1",
      userId: "user-1",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "evolution", resourceId: "p1" })
    );
  });

  it("admin → todas", async () => {
    asRole("admin");
    await listEvolutions(req("http://x/api/patients/p1/evolutions"), patientCtx);
    expect(prismaMock.evolution.findMany.mock.calls[0][0].where).toEqual({ clinicalRecordId: "cr1" });
  });
});

// ── Evolution DELETE (anulación) ──────────────────────────────────────────────
describe("DELETE evolution (anulación)", () => {
  it("médico no autor → 404 y no anula", async () => {
    asRole("medic");
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", ...FOREIGN, annulledAt: null });
    const res = await delEvolution(
      req("http://x/api/patients/p1/evolutions/e1", "DELETE", { annulReason: "x" }),
      evoCtx
    );
    expect(res.status).toBe(404);
    expect(prismaMock.evolution.update).not.toHaveBeenCalled();
  });

  it("autor → anula; el motivo NO va al audit", async () => {
    asRole("medic");
    prismaMock.evolution.findFirst.mockResolvedValue({ id: "e1", ...OWN, annulledAt: null });
    const res = await delEvolution(
      req("http://x/api/patients/p1/evolutions/e1", "DELETE", { annulReason: "Diagnóstico erróneo de HIV" }),
      evoCtx
    );
    expect(res.status).toBe(200);
    expect(prismaMock.evolution.update).toHaveBeenCalled();
    expect(prismaMock.evolution.delete).not.toHaveBeenCalled();
    const call = vi.mocked(logAudit).mock.calls.find((c) => c[0].action === "DELETE");
    expect(call?.[0].details).toEqual({ patientId: "p1", annulled: true });
  });
});

// ── Clinical record — vista redactada por lista blanca ────────────────────────
describe("clinical-record GET/PUT", () => {
  const FULL_RECORD = {
    id: "cr1",
    patientId: "p1",
    structuredAllergies: JSON.stringify([{ nombre: "Penicilina", severidad: "alta" }]),
    allergies: "Penicilina",
    personalHistory: "HTA",
    notes: "nota",
    customFields: JSON.stringify({ x: "secreto" }),
    habitsTobacco: "20 cig/día",
    heightCm: 180,
    weightKg: 90,
    odontogram: "{}",
    createdAt: new Date(),
    updatedAt: new Date(),
    evolutions: [],
  };
  const url = "http://x/api/patients/p1/clinical-record";

  beforeEach(() => {
    prismaMock.patient.findFirst.mockResolvedValue({ id: "p1" });
  });

  function expectWhitelisted(data: Record<string, unknown>) {
    expect(data.id).toBe("cr1");
    expect(data.patientId).toBe("p1");
    expect(data.structuredAllergies).toBe(FULL_RECORD.structuredAllergies);
    for (const k of ["allergies", "personalHistory", "notes", "customFields", "habitsTobacco", "heightCm", "weightKg", "odontogram"]) {
      expect(data[k]).toBeNull();
    }
    expect(data.evolutions).toEqual([]);
  }

  it("secretaria → vista redactada (solo alergias estructuradas)", async () => {
    asRole("secretary");
    prismaMock.clinicalRecord.findUnique.mockResolvedValue(FULL_RECORD);
    const res = await getClinicalRecord(req(url), patientCtx);
    expect(res.status).toBe(200);
    expectWhitelisted((await res.json()).data);
  });

  it("rol desconocido / sin rol → 403", async () => {
    asRole(null);
    expect((await getClinicalRecord(req(url), patientCtx)).status).toBe(403);
  });

  it("médico sin relación → ficha vacía por lista blanca (sin hábitos/antropometría/customFields)", async () => {
    asRole("medic");
    prismaMock.clinicalRecord.upsert.mockResolvedValue(FULL_RECORD);
    const res = await getClinicalRecord(req(url), patientCtx);
    expect(res.status).toBe(200);
    expectWhitelisted((await res.json()).data);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("médico con relación → ficha completa, solo sus evoluciones, VIEW_SENSITIVE", async () => {
    asRole("medic");
    prismaMock.prescription.count.mockResolvedValue(1);
    prismaMock.clinicalRecord.upsert.mockResolvedValue(FULL_RECORD);
    const res = await getClinicalRecord(req(url), patientCtx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.habitsTobacco).toBe("20 cig/día");
    expect(prismaMock.clinicalRecord.upsert.mock.calls[0][0].include.evolutions.where).toEqual({ userId: "user-1" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "clinical_record" }));
  });

  it("PUT: secretaria 403, médico sin relación 403, admin 200", async () => {
    asRole("secretary");
    expect((await putClinicalRecord(req(url, "PUT", { notes: "x" }), patientCtx)).status).toBe(403);

    asRole("medic");
    expect((await putClinicalRecord(req(url, "PUT", { notes: "x" }), patientCtx)).status).toBe(403);
    expect(prismaMock.clinicalRecord.upsert).not.toHaveBeenCalled();

    asRole("admin");
    prismaMock.clinicalRecord.upsert.mockResolvedValue(FULL_RECORD);
    expect((await putClinicalRecord(req(url, "PUT", { notes: "x" }), patientCtx)).status).toBe(200);
  });
});

// ── Clinical ledger — autoría validada para TODOS los entityType ─────────────
describe("clinical-ledger GET", () => {
  const ledgerUrl = (entityType: string) =>
    `http://x/api/clinical-ledger?entityType=${entityType}&entityId=x1`;

  it("secretaria → 403", async () => {
    asRole("secretary");
    expect((await getLedger(req(ledgerUrl("evolution")))).status).toBe(403);
  });

  it.each([
    ["evolution", "evolution"],
    ["prescription", "prescription"],
    ["study_order", "studyOrder"],
    ["meal_plan", "mealPlan"],
  ] as const)("médico no autor de %s → 404", async (entityType, model) => {
    asRole("medic");
    prismaMock[model].findUnique.mockResolvedValue({ id: "x1", ...FOREIGN });
    expect((await getLedger(req(ledgerUrl(entityType)))).status).toBe(404);
    expect(prismaMock.clinicalEntryVersion.findMany).not.toHaveBeenCalled();
  });

  it("médico autor → 200 + VIEW_SENSITIVE clinical_ledger", async () => {
    asRole("medic");
    prismaMock.prescription.findUnique.mockResolvedValue({ id: "x1", ...OWN });
    const res = await getLedger(req(ledgerUrl("prescription")));
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "clinical_ledger", resourceId: "x1" })
    );
  });

  it("clinical_record: médico sin relación → 404; con relación → 200", async () => {
    asRole("medic");
    prismaMock.clinicalRecord.findUnique.mockResolvedValue({ patientId: "p1" });
    expect((await getLedger(req(ledgerUrl("clinical_record")))).status).toBe(404);

    prismaMock.evolution.count.mockResolvedValue(1);
    expect((await getLedger(req(ledgerUrl("clinical_record")))).status).toBe(200);
  });

  it("admin → 200 sobre asientos ajenos", async () => {
    asRole("admin");
    prismaMock.mealPlan.findUnique.mockResolvedValue({ id: "x1", ...FOREIGN });
    expect((await getLedger(req(ledgerUrl("meal_plan")))).status).toBe(200);
  });
});

// ── Prescriptions — el médico solo ve sus recetas ────────────────────────────
describe("prescriptions GET", () => {
  it("lista: secretaria 403; médico filtra por autor; admin ve todas", async () => {
    const url = "http://x/api/prescriptions?patientId=p1";
    asRole("secretary");
    expect((await listPrescriptions(req(url))).status).toBe(403);

    asRole("medic");
    await listPrescriptions(req(url));
    expect(prismaMock.prescription.findMany.mock.calls[0][0].where).toEqual({ patientId: "p1", userId: "user-1" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "prescription", resourceId: "p1" })
    );

    asRole("admin");
    await listPrescriptions(req(url));
    expect(prismaMock.prescription.findMany.mock.calls[1][0].where).toEqual({ patientId: "p1" });
  });

  it("[id]: médico no autor → 404; autor → 200 + VIEW_SENSITIVE", async () => {
    asRole("medic");
    prismaMock.prescription.findUnique.mockResolvedValue({ id: "x1", patientId: "p1", ...FOREIGN });
    expect((await getPrescription(req("http://x/api/prescriptions/x1"), idCtx)).status).toBe(404);

    prismaMock.prescription.findUnique.mockResolvedValue({ id: "x1", patientId: "p1", ...OWN });
    expect((await getPrescription(req("http://x/api/prescriptions/x1"), idCtx)).status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SENSITIVE", resource: "prescription", resourceId: "x1" })
    );
  });
});

// ── Meal plan single GET/PUT — must require module access ──────────────────────
describe("IDOR: meal-plan [id] requiere módulo", () => {
  beforeEach(() => {
    asRole("medic");
  });

  it("GET sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await getMealPlan(req("http://x/api/meal-plans/x1"), idCtx);
    expect(res.status).toBe(403);
  });

  it("PUT sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await putMealPlan(req("http://x/api/meal-plans/x1", "PUT", { title: "x" }), idCtx);
    expect(res.status).toBe(403);
  });
});

// ── Study order single GET/PUT/DELETE — must require module access ─────────────
describe("IDOR: study-order [id] requiere módulo", () => {
  beforeEach(() => {
    asRole("medic");
  });

  it("GET sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await getStudyOrder(req("http://x/api/study-orders/x1"), idCtx);
    expect(res.status).toBe(403);
  });

  it("PUT sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await putStudyOrder(req("http://x/api/study-orders/x1", "PUT", { status: "PENDING" }), idCtx);
    expect(res.status).toBe(403);
  });

  it("DELETE sin módulo → 403", async () => {
    vi.mocked(checkModuleAccess).mockResolvedValue(false);
    const res = await delStudyOrder(req("http://x/api/study-orders/x1", "DELETE"), idCtx);
    expect(res.status).toBe(403);
  });
});
