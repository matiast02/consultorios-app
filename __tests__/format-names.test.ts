import { describe, it, expect } from "vitest";
import {
  calcAge,
  capitalize,
  formatDateAR,
  formatDateShortAR,
  formatDni,
  formatEta,
  formatTime,
  formatTimeAmPm,
  isSameLocalDay,
  minutesSince,
  minutesUntil,
  normalizeText,
  toLocalDateISO,
} from "@/lib/format";
import {
  avatarColor,
  fullName,
  honorific,
  initials,
  initialsFromName,
  medicShortName,
  medicShortNameFromFull,
  personLabel,
} from "@/lib/names";

// Helpers compartidos que reemplazan a las copias locales de cards, diálogos y rutas.

describe("lib/format", () => {
  const d = new Date(2026, 8, 25, 9, 5); // 25/09/2026 09:05 local

  it("hora en 24 h y en a. m./p. m.", () => {
    expect(formatTime(d)).toBe("09:05");
    expect(formatTime(d.toISOString())).toBe("09:05");
    expect(formatTimeAmPm(d)).toBe("9:05 a. m.");
    expect(formatTimeAmPm(new Date(2026, 8, 25, 15, 40))).toBe("3:40 p. m.");
    expect(formatTimeAmPm(new Date(2026, 8, 25, 0, 10))).toBe("12:10 a. m.");
    expect(formatTimeAmPm(new Date(2026, 8, 25, 12, 0))).toBe("12:00 p. m.");
  });

  it("fechas dd/mm/aaaa y dd/mm/aa; «—» sin fecha", () => {
    expect(formatDateAR(d)).toBe("25/09/2026");
    expect(formatDateAR(null)).toBe("—");
    expect(formatDateAR("no es fecha")).toBe("—");
    expect(formatDateShortAR(d)).toBe("25/09/26");
  });

  it("YYYY-MM-DD en hora local (no UTC): a las 23 h sigue siendo el mismo día", () => {
    const late = new Date(2026, 8, 25, 23, 30);
    expect(toLocalDateISO(late)).toBe("2026-09-25");
    expect(isSameLocalDay(late, d)).toBe(true);
    expect(isSameLocalDay(late, new Date(2026, 8, 26, 0, 5))).toBe(false);
  });

  it("texto: capitalizar y normalizar sin acentos", () => {
    expect(capitalize("viernes")).toBe("Viernes");
    expect(capitalize("")).toBe("");
    expect(normalizeText("Gómez Álvarez")).toBe("gomez alvarez");
  });

  it("edad cumplida", () => {
    const t = new Date();
    const birth = new Date(t.getFullYear() - 30, t.getMonth(), t.getDate());
    expect(calcAge(birth.toISOString())).toBe(30);
    const tomorrow = new Date(t.getFullYear() - 30, t.getMonth(), t.getDate() + 1);
    expect(calcAge(tomorrow)).toBe(29);
    expect(calcAge(null)).toBeNull();
    expect(calcAge("x")).toBeNull();
  });

  it("minutos y «en N min»", () => {
    const now = new Date(2026, 8, 25, 10, 0);
    expect(minutesSince(new Date(2026, 8, 25, 9, 48), now)).toBe(12);
    expect(minutesSince(new Date(2026, 8, 25, 10, 5), now)).toBe(0);
    expect(minutesUntil(new Date(2026, 8, 25, 11, 20), now)).toBe(80);
    expect(formatEta(0)).toBe("ahora");
    expect(formatEta(5)).toBe("en 5 min");
    expect(formatEta(60)).toBe("en 1 h");
    expect(formatEta(80)).toBe("en 1 h 20 min");
  });

  it("DNI con puntos", () => {
    expect(formatDni("33891234")).toBe("33.891.234");
    expect(formatDni("1234")).toBe("1234");
    expect(formatDni(null)).toBeNull();
  });
});

describe("lib/names", () => {
  it("Dr./Dra. por terminación del nombre de pila", () => {
    expect(honorific("María")).toBe("Dra.");
    expect(honorific("Martín")).toBe("Dr.");
    expect(medicShortName({ firstName: "María", lastName: "López" })).toBe("Dra. López");
    expect(medicShortName({ firstName: "Martín", lastName: "Gervilla" })).toBe("Dr. Gervilla");
    expect(medicShortName({ firstName: "Ana", lastName: null, name: "Ana" })).toBe("Dra. Ana");
    expect(medicShortName({ firstName: null, lastName: null, name: "Consultorio" })).toBe("Consultorio");
    expect(medicShortName(null)).toBe("Profesional");
  });

  it("desde el nombre completo (dashboard del médico)", () => {
    expect(medicShortNameFromFull("Martín Gervilla")).toBe("Dr. Gervilla");
    expect(medicShortNameFromFull("Valentina Martínez")).toBe("Dra. Martínez");
    expect(medicShortNameFromFull("Juan")).toBe("Dr. Juan");
    expect(medicShortNameFromFull("")).toBe("Profesional");
  });

  it("«Apellido, Nombre», nombre completo e iniciales", () => {
    expect(personLabel({ firstName: "Lucas", lastName: "Rodríguez" })).toBe("Rodríguez, Lucas");
    expect(personLabel({ firstName: "Lucas", lastName: "" })).toBe("Lucas");
    expect(personLabel(null)).toBe("Paciente");
    expect(fullName({ firstName: "Lucas", lastName: "Rodríguez" })).toBe("Lucas Rodríguez");
    expect(initials("Lucas", "Rodríguez")).toBe("LR");
    expect(initials("", null)).toBe("?");
    expect(initialsFromName("Martín Gervilla")).toBe("MG");
    expect(initialsFromName("Ana María del Valle")).toBe("AV");
    expect(initialsFromName("Ana")).toBe("A");
  });

  it("color de avatar estable por semilla", () => {
    expect(avatarColor("abc")).toBe(avatarColor("abc"));
    expect(avatarColor("abc")).toMatch(/^bg-/);
  });
});
