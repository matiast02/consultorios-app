import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import {
  assembleHcCopy,
  canonicalJson,
  hashHcCopy,
  hcCopyFileName,
  renderHcCopyPdf,
  type HcCopy,
} from "@/lib/hc-copy";

const d = (s: string) => new Date(s);

function seedPatientHc() {
  prismaMock.patient.findUnique.mockResolvedValue({
    id: "p1",
    firstName: "Ana",
    lastName: "Pérez",
    dni: "30111222",
    birthDate: d("1985-04-10T00:00:00Z"),
    sex: "F",
    email: "ana@example.com",
    telephone: "1155550000",
    address: "Calle 1",
    province: "Buenos Aires",
    country: "Argentina",
    osId: "os1",
    osNumber: "A-123",
    emergencyContactName: null,
    emergencyContactPhone: null,
    consentType: "WRITTEN",
    consentGivenAt: d("2026-01-02T12:00:00Z"),
    deletedAt: null,
    os: { name: "OSDE", code: "210" },
    insurances: [
      { healthInsuranceId: "os2", affiliateNumber: "999", healthInsurance: { name: "PAMI" } },
    ],
  });
  prismaMock.clinicalRecord.findUnique.mockResolvedValue({
    id: "cr1",
    patientId: "p1",
    bloodType: "A+",
    allergies: "Penicilina",
    personalHistory: "HTA",
    familyHistory: null,
    currentMedication: "Enalapril",
    notes: null,
    customFields: '{"presion":"120/80"}',
    heightCm: 165,
    weightKg: { toFixed: () => "60.50", toString: () => "60.5" }, // Prisma.Decimal-like
    habitsTobacco: null,
    habitsAlcohol: null,
    habitsActivity: null,
    habitsDiet: null,
    structuredAllergies: '[{"nombre":"Penicilina","severidad":"alta"}]',
    odontogram: null,
    genogram: null,
    createdAt: d("2026-01-01T10:00:00Z"),
    updatedAt: d("2026-02-01T10:00:00Z"),
  });
  prismaMock.evolution.findMany.mockResolvedValue([
    {
      id: "e2",
      userId: "medic-b",
      shiftId: null,
      reason: "Control",
      physicalExam: null,
      diagnosis: "Error de carga",
      diagnosisCode: null,
      treatment: null,
      indications: null,
      notes: null,
      annulledAt: d("2026-03-05T10:00:00Z"),
      annulReason: "Paciente equivocado",
      annulledById: "medic-b",
      createdAt: d("2026-03-01T10:00:00Z"),
      updatedAt: d("2026-03-05T10:00:00Z"),
    },
    {
      id: "e1",
      userId: "medic-a",
      shiftId: "s1",
      reason: "Cefalea",
      physicalExam: "Normal",
      diagnosis: "Migraña",
      diagnosisCode: "G43",
      treatment: "Ibuprofeno",
      indications: null,
      notes: null,
      annulledAt: null,
      annulReason: null,
      annulledById: null,
      createdAt: d("2026-02-10T10:00:00Z"),
      updatedAt: d("2026-02-10T10:00:00Z"),
    },
  ]);
  prismaMock.prescription.findMany.mockResolvedValue([
    {
      id: "rx1",
      userId: "medic-a",
      shiftId: null,
      items: '[{"medication":"Ibuprofeno 400","dose":"1 comp","frequency":"c/8h","duration":"5 días"}]',
      diagnosis: "Migraña",
      notes: null,
      durationDays: 30,
      annulledAt: null,
      annulReason: null,
      annulledById: null,
      createdAt: d("2026-02-10T10:05:00Z"),
      updatedAt: d("2026-02-10T10:05:00Z"),
    },
  ]);
  prismaMock.studyOrder.findMany.mockResolvedValue([]);
  prismaMock.mealPlan.findMany.mockResolvedValue([]);
  prismaMock.clinicalAccessGrant.findMany.mockResolvedValue([
    {
      id: "g1",
      grantedToUserId: "medic-b",
      status: "ACTIVE",
      startsAt: d("2026-02-20T00:00:00Z"),
      expiresAt: d("2026-05-20T00:00:00Z"),
      createdAt: d("2026-02-19T00:00:00Z"),
    },
  ]);
  prismaMock.clinicalEntryVersion.findMany.mockResolvedValue([
    { entityType: "evolution", entityId: "e2", version: 1, action: "created", contentHash: "h-e2-v1", createdAt: d("2026-03-01T10:00:00Z") },
    { entityType: "evolution", entityId: "e2", version: 2, action: "annulled", contentHash: "h-e2-v2", createdAt: d("2026-03-05T10:00:00Z") },
    { entityType: "evolution", entityId: "e1", version: 1, action: "created", contentHash: "h-e1-v1", createdAt: d("2026-02-10T10:00:00Z") },
    { entityType: "clinical_record", entityId: "cr1", version: 3, action: "corrected", contentHash: "h-cr-v3", createdAt: d("2026-02-01T10:00:00Z") },
  ]);
  prismaMock.user.findMany.mockResolvedValue([
    { id: "medic-a", name: "a", firstName: "Laura", lastName: "Gómez", licenseNumber: "MN 1111" },
    { id: "medic-b", name: "b", firstName: "Pedro", lastName: "Ruiz", licenseNumber: null },
  ]);
}

/** Copia profunda con el orden de claves invertido en todos los niveles. */
function reverseKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reverseKeys) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).reverse()) {
      out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return v;
}

describe("assembleHcCopy", () => {
  beforeEach(() => {
    resetAllMocks();
    seedPatientHc();
  });

  it("devuelve null si el paciente no existe", async () => {
    prismaMock.patient.findUnique.mockResolvedValue(null);
    expect(await assembleHcCopy("nope")).toBeNull();
  });

  it("incluye TODOS los autores (sin filtrar por médico) en orden cronológico", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    expect(prismaMock.evolution.findMany.mock.calls[0][0].where).toEqual({
      clinicalRecord: { patientId: "p1" },
    });
    expect(copy.entries.map((e) => `${e.entityType}:${e.id}`)).toEqual([
      "evolution:e1",
      "prescription:rx1",
      "evolution:e2",
    ]);
    expect(new Set(copy.entries.map((e) => e.author.id))).toEqual(new Set(["medic-a", "medic-b"]));
    expect(copy.entries[0].author).toEqual({ id: "medic-a", name: "Laura Gómez", licenseNumber: "MN 1111" });
  });

  it("conserva los asientos anulados con fecha, autor y motivo", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    const annulled = copy.entries.find((e) => e.id === "e2")!;
    expect(annulled.annulment).toEqual({
      at: "2026-03-05T10:00:00.000Z",
      reason: "Paciente equivocado",
      by: { id: "medic-b", name: "Pedro Ruiz", licenseNumber: null },
    });
    expect(annulled.data.diagnosis).toBe("Error de carga");
  });

  it("toma el contentHash de la ÚLTIMA versión del ledger por asiento", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    expect(copy.entries.find((e) => e.id === "e2")!.ledger).toMatchObject({ version: 2, contentHash: "h-e2-v2", action: "annulled" });
    expect(copy.entries.find((e) => e.id === "e1")!.ledger?.contentHash).toBe("h-e1-v1");
    expect(copy.entries.find((e) => e.id === "rx1")!.ledger).toBeNull();
    expect(copy.clinicalRecord?.ledger?.contentHash).toBe("h-cr-v3");
  });

  it("normaliza a JSON puro: JSON embebido parseado, Decimal como string, fechas ISO", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    expect(copy.clinicalRecord?.data.weightKg).toBe("60.5");
    expect(copy.clinicalRecord?.data.structuredAllergies).toEqual([{ nombre: "Penicilina", severidad: "alta" }]);
    expect(copy.clinicalRecord?.data.customFields).toEqual({ presion: "120/80" });
    expect(copy.entries.find((e) => e.id === "rx1")!.data.items).toEqual([
      { medication: "Ibuprofeno 400", dose: "1 comp", frequency: "c/8h", duration: "5 días" },
    ]);
    expect(copy.patient.birthDate).toBe("1985-04-10T00:00:00.000Z");
    expect(copy.patient.healthInsurance).toEqual({ name: "OSDE", code: "210", affiliateNumber: "A-123" });
    expect(copy.patient.otherInsurances).toEqual([{ name: "PAMI", affiliateNumber: "999" }]);
    // Round-trip JSON sin pérdidas.
    expect(JSON.parse(JSON.stringify(copy))).toEqual(copy);
  });

  it("incluye las concesiones de acceso con el profesional destinatario", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    expect(copy.accessGrants).toEqual([
      {
        id: "g1",
        grantedTo: { id: "medic-b", name: "Pedro Ruiz", licenseNumber: null },
        status: "ACTIVE",
        startsAt: "2026-02-20T00:00:00.000Z",
        expiresAt: "2026-05-20T00:00:00.000Z",
        createdAt: "2026-02-19T00:00:00.000Z",
      },
    ]);
  });
});

describe("hashHcCopy", () => {
  beforeEach(() => {
    resetAllMocks();
    seedPatientHc();
  });

  it("es determinístico: mismo input → mismo hash (sha256 hex)", async () => {
    const a = (await assembleHcCopy("p1"))!;
    const b = (await assembleHcCopy("p1"))!;
    expect(hashHcCopy(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashHcCopy(a)).toBe(hashHcCopy(b));
  });

  it("no depende del orden de las claves (JSON canónico)", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    const reordered = reverseKeys(copy);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(copy));
    expect(canonicalJson(reordered)).toBe(canonicalJson(copy));
    expect(hashHcCopy(reordered)).toBe(hashHcCopy(copy));
  });

  it("cambia si cambia el contenido clínico", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    const tampered: HcCopy = JSON.parse(JSON.stringify(copy));
    tampered.entries[0].data.diagnosis = "Otra cosa";
    expect(hashHcCopy(tampered)).not.toBe(hashHcCopy(copy));
  });
});

describe("renderHcCopyPdf / hcCopyFileName", () => {
  beforeEach(() => {
    resetAllMocks();
    seedPatientHc();
  });

  it("genera un PDF con el hash del documento y los asientos anulados marcados", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    const pdf = renderHcCopyPdf(copy, {
      requestId: "req-1",
      clinicName: "Consultorio Central",
      issuedAt: d("2026-09-23T15:00:00Z"),
      issuedBy: { name: "Laura Gómez", licenseNumber: "MN 1111", roleLabel: "Profesional" },
      requester: { type: "PATIENT", name: "Ana Pérez", dni: "30111222" },
      requestedAt: d("2026-09-22T15:00:00Z"),
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain(hashHcCopy(copy));
    expect(text).toContain("ANULADO");
    expect(text).toContain("h-e2-v2");
  });

  it("nombre de archivo ASCII con apellido y fecha de Argentina", () => {
    // 02:00 UTC del 24/09 = 23:00 del 23/09 en Argentina (UTC-3)
    expect(hcCopyFileName("Pérez Núñez", d("2026-09-24T02:00:00Z"))).toBe("HC-Perez-Nunez-2026-09-23.pdf");
    expect(hcCopyFileName("", d("2026-09-24T12:00:00Z"))).toBe("HC-paciente-2026-09-24.pdf");
  });
});

describe("copia de HC — adjuntos", () => {
  const ATT_SHA = "a".repeat(64);
  const meta = {
    requestId: "req-1",
    clinicName: "Consultorio Central",
    issuedAt: d("2026-09-23T15:00:00Z"),
    issuedBy: { name: "Laura Gómez" },
    requester: { type: "PATIENT" as const, name: "Ana Pérez", dni: "30111222" },
    requestedAt: d("2026-09-22T15:00:00Z"),
  };

  beforeEach(() => {
    resetAllMocks();
    seedPatientHc();
  });

  it("sin adjuntos: la clave no aparece (el hash de copias ya entregadas no cambia)", async () => {
    const copy = (await assembleHcCopy("p1"))!;
    expect(copy).not.toHaveProperty("attachments");
    expect(canonicalJson(copy)).not.toContain("attachments");
  });

  it("lista los adjuntos con autor, sha256, ledger y anulación; nunca pide la DEK ni la clave de objeto", async () => {
    prismaMock.clinicalAttachment.findMany.mockResolvedValue([
      {
        id: "att1",
        uploadedById: "medic-a",
        entityType: "STUDY_ORDER",
        entityId: "o1",
        fileName: "Hemograma.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        sha256: ATT_SHA,
        description: "Resultado laboratorio",
        annulledAt: null,
        annulledById: null,
        annulReason: null,
        createdAt: d("2026-02-11T10:00:00Z"),
      },
      {
        id: "att2",
        uploadedById: "medic-b",
        entityType: "CLINICAL_RECORD",
        entityId: null,
        fileName: "rx.png",
        mimeType: "image/png",
        sizeBytes: 10,
        sha256: "b".repeat(64),
        description: null,
        annulledAt: d("2026-03-06T10:00:00Z"),
        annulledById: "medic-b",
        annulReason: "Paciente equivocado",
        createdAt: d("2026-03-06T09:00:00Z"),
      },
    ]);
    prismaMock.clinicalEntryVersion.findMany.mockResolvedValue([
      { entityType: "attachment", entityId: "att1", version: 1, action: "created", contentHash: "h-att1", createdAt: d("2026-02-11T10:00:00Z") },
    ]);

    const copy = (await assembleHcCopy("p1"))!;
    const select = prismaMock.clinicalAttachment.findMany.mock.calls[0][0].select;
    expect(select.wrappedDek).toBeUndefined();
    expect(select.storageKey).toBeUndefined();
    expect(prismaMock.clinicalEntryVersion.findMany.mock.calls[0][0].where.entityId.in).toContain("att1");

    expect(copy.attachments).toHaveLength(2);
    expect(copy.attachments![0]).toEqual({
      id: "att1",
      entityType: "STUDY_ORDER",
      entityId: "o1",
      fileName: "Hemograma.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: ATT_SHA,
      description: "Resultado laboratorio",
      createdAt: "2026-02-11T10:00:00.000Z",
      author: { id: "medic-a", name: "Laura Gómez", licenseNumber: "MN 1111" },
      annulment: null,
      ledger: { version: 1, action: "created", contentHash: "h-att1", recordedAt: "2026-02-11T10:00:00.000Z" },
    });
    expect(copy.attachments![1].annulment).toEqual({
      at: "2026-03-06T10:00:00.000Z",
      reason: "Paciente equivocado",
      by: { id: "medic-b", name: "Pedro Ruiz", licenseNumber: null },
    });

    // Entra en el JSON canónico: cambia el hash.
    const without: HcCopy = JSON.parse(JSON.stringify(copy));
    delete without.attachments;
    expect(hashHcCopy(copy)).not.toBe(hashHcCopy(without));

    const text = renderHcCopyPdf(copy, meta).toString("latin1");
    // Secciones: 4 = concesiones (hay una), 5 = adjuntos, 6 = integridad.
    expect(text).toContain("5. Adjuntos");
    expect(text).toContain("6. Integridad");
    expect(text).toContain("Hemograma.pdf");
    expect(text).toContain(ATT_SHA);
    expect(text).toContain("h-att1");
    expect(text).toContain("Paciente equivocado");
  });
});
