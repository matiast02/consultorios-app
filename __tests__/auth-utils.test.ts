// Rol efectivo determinista (B13): con varios roles gana el más privilegiado,
// sin depender del orden en que la base devuelva las filas.
import { describe, it, expect, vi } from "vitest";
import { prismaMock, resetAllMocks } from "./setup";
import { isAppRole, pickRole, ROLE_PRIORITY } from "@/lib/roles";

describe("lib/roles", () => {
  it("pickRole elige por prioridad e ignora desconocidos y vacíos", () => {
    expect(ROLE_PRIORITY).toEqual(["admin", "secretary", "medic"]);
    expect(pickRole(["medic", "admin"])).toBe("admin");
    expect(pickRole(["medic", "secretary"])).toBe("secretary");
    expect(pickRole(["medic"])).toBe("medic");
    expect(pickRole(["viewer", null, undefined])).toBeNull();
    expect(pickRole([])).toBeNull();
  });

  it("isAppRole", () => {
    expect(isAppRole("admin")).toBe(true);
    expect(isAppRole("root")).toBe(false);
    expect(isAppRole(null)).toBe(false);
  });
});

describe("getUserRole (implementación real, no el mock del setup)", () => {
  it("resuelve por prioridad, no por orden de la base; null sin roles", async () => {
    resetAllMocks();
    const actual = await vi.importActual<typeof import("@/lib/auth-utils")>("@/lib/auth-utils");

    prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: "medic" } }, { role: { name: "admin" } }]);
    expect(await actual.getUserRole("u1")).toBe("admin");
    expect(prismaMock.userRole.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });

    prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: "secretary" } }, { role: { name: "medic" } }]);
    expect(await actual.getUserRole("u1")).toBe("secretary");

    prismaMock.userRole.findMany.mockResolvedValue([]);
    expect(await actual.getUserRole("u1")).toBeNull();
  });
});
