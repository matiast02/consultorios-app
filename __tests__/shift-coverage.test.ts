import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import { resolveShiftCoverage, coverageData } from "@/lib/shift-coverage";

const db = prismaMock as never;
const ARGS = { userId: "m1", patientId: "p1" };

function patientWith(os: { id: string; name: string } | null) {
  prismaMock.patient.findUnique.mockResolvedValue({ osId: os?.id ?? null, os });
}

function extraInsurances(list: Array<{ id: string; name: string }>) {
  prismaMock.patientInsurance.findMany.mockResolvedValue(
    list.map((i) => ({ healthInsuranceId: i.id, healthInsurance: { name: i.name } })),
  );
}

function medicAccepts(ids: string[]) {
  prismaMock.userInsurance.findMany.mockResolvedValue(ids.map((id) => ({ healthInsuranceId: id })));
}

describe("resolveShiftCoverage", () => {
  beforeEach(() => resetAllMocks());

  it("sin obra social → particular, sin aviso", async () => {
    patientWith(null);
    expect(await resolveShiftCoverage(db, ARGS)).toEqual({ coverageInsuranceId: null, isPrivate: true, mismatch: false });
  });

  it("la obra social «Particular» del paciente cuenta como particular", async () => {
    patientWith({ id: "part", name: "Particular" });
    medicAccepts(["part"]);
    expect(await resolveShiftCoverage(db, ARGS)).toEqual({ coverageInsuranceId: null, isPrivate: true, mismatch: false });
  });

  it("profesional sin lista configurada → la principal del paciente", async () => {
    patientWith({ id: "osde", name: "OSDE" });
    extraInsurances([{ id: "swiss", name: "Swiss Medical" }]);
    medicAccepts([]);
    expect(await resolveShiftCoverage(db, ARGS)).toEqual({ coverageInsuranceId: "osde", isPrivate: false, mismatch: false });
  });

  it("sin principal pero con obras sociales adicionales → la primera cargada", async () => {
    patientWith(null);
    extraInsurances([{ id: "ioma", name: "IOMA" }, { id: "pami", name: "PAMI" }]);
    expect(await resolveShiftCoverage(db, ARGS)).toEqual({ coverageInsuranceId: "ioma", isPrivate: false, mismatch: false });
  });

  it("acepta la principal → esa", async () => {
    patientWith({ id: "osde", name: "OSDE" });
    extraInsurances([{ id: "swiss", name: "Swiss Medical" }]);
    medicAccepts(["swiss", "osde"]);
    expect((await resolveShiftCoverage(db, ARGS)).coverageInsuranceId).toBe("osde");
  });

  it("no acepta la principal pero sí otra del paciente → esa", async () => {
    patientWith({ id: "osde", name: "OSDE" });
    extraInsurances([{ id: "swiss", name: "Swiss Medical" }]);
    medicAccepts(["swiss"]);
    expect(await resolveShiftCoverage(db, ARGS)).toEqual({ coverageInsuranceId: "swiss", isPrivate: false, mismatch: false });
  });

  it("no acepta ninguna → particular con aviso", async () => {
    patientWith({ id: "osde", name: "OSDE" });
    medicAccepts(["pami"]);
    expect(await resolveShiftCoverage(db, ARGS)).toEqual({ coverageInsuranceId: null, isPrivate: true, mismatch: true });
  });

  it("coverageData deja solo los campos del turno", () => {
    expect(coverageData({ coverageInsuranceId: "x", isPrivate: false, mismatch: true })).toEqual({
      coverageInsuranceId: "x",
      isPrivate: false,
    });
  });
});
