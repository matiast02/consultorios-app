import { describe, it, expect } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MISMATCH,
  isValidPassword,
  passwordChecks,
  passwordConfirmError,
  passwordError,
  passwordStrength,
} from "@/lib/password-policy";
import { changePasswordFormSchema, passwordSchema, resetPasswordFormSchema } from "@/lib/validations";

// Regla única de contraseña: la comparten alta, reset, cambio y formularios.

describe("lib/password-policy", () => {
  it("exige largo mínimo, mayúscula y número; el símbolo solo suma", () => {
    expect(passwordError("Abc1234")).toMatch(/al menos 8/);
    expect(passwordError("abcdefg1")).toMatch(/mayúscula/);
    expect(passwordError("Abcdefgh")).toMatch(/número/);
    expect(passwordError("Abcdefg1")).toBeNull();
    expect(isValidPassword("Abcdefg1")).toBe(true);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("checks y fuerza", () => {
    const checks = passwordChecks("Abcdefg1!");
    expect(checks.map((c) => c.met)).toEqual([true, true, true, true]);
    expect(checks.filter((c) => c.required)).toHaveLength(3);
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("Abcdefg1")).toBe(3);
    expect(passwordStrength("Abcdefg1!")).toBe(4);
  });

  it("confirmación", () => {
    expect(passwordConfirmError("Abcdefg1", "Abcdefg1")).toBeNull();
    expect(passwordConfirmError("Abcdefg1", "otra")).toBe(PASSWORD_MISMATCH);
    expect(passwordConfirmError("corta", "corta")).toMatch(/al menos 8/);
  });
});

describe("schemas de contraseña en lib/validations", () => {
  it("passwordSchema usa la misma regla y el mismo mensaje", () => {
    expect(passwordSchema.safeParse("Abcdefg1").success).toBe(true);
    const bad = passwordSchema.safeParse("abcdefgh");
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toMatch(/mayúscula/);
  });

  it("formularios: confirmación en confirmPassword", () => {
    const r = resetPasswordFormSchema.safeParse({ password: "Abcdefg1", confirmPassword: "Abcdefg2" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["confirmPassword"]);
    expect(resetPasswordFormSchema.safeParse({ password: "Abcdefg1", confirmPassword: "Abcdefg1" }).success).toBe(true);

    const c = changePasswordFormSchema.safeParse({ currentPassword: "x", newPassword: "Abcdefg1", confirmPassword: "Abcdefg1" });
    expect(c.success).toBe(true);
    expect(changePasswordFormSchema.safeParse({ currentPassword: "", newPassword: "Abcdefg1", confirmPassword: "Abcdefg1" }).success).toBe(false);
  });
});
