// Control de acceso a datos clínicos (historia clínica, evoluciones, recetas,
// órdenes de estudio, planes alimentarios, ledger).
//
// Política (Ley 25.326 arts. 7-10, Ley 26.529):
// - Solo roles clínicos (medic) y admin pueden leer o escribir datos clínicos.
//   Secretaria, usuarios sin rol o roles desconocidos: nunca (lista blanca).
// - Un médico ve la ficha clínica de un paciente solo si tiene al menos un
//   asiento propio con ese paciente; y ve/edita/anula únicamente sus asientos.
// - El admin tiene acceso completo por diseño (custodio de la HC), siempre
//   auditado por quien llama (VIEW_SENSITIVE).
//
// Fase 3 (concesiones `ClinicalAccessGrant`) extenderá `canAccessEntry` y
// `medicHasRelationship` sin tocar las rutas: por eso todas deben pasar por acá.

import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";

export const CLINICAL_ROLES = ["medic", "admin"] as const;
export type ClinicalRole = (typeof CLINICAL_ROLES)[number];

export interface ClinicalActor {
  userId: string;
  role: ClinicalRole;
  isAdmin: boolean;
  isMedic: boolean;
}

export function isClinicalRole(role: string | null | undefined): role is ClinicalRole {
  return role === "medic" || role === "admin";
}

/**
 * Resuelve el actor clínico. Devuelve null si el rol no está en la lista blanca
 * (secretaria, sin rol, desconocido): la ruta debe responder 403.
 */
export async function getClinicalActor(userId: string): Promise<ClinicalActor | null> {
  const role = await getUserRole(userId);
  if (!isClinicalRole(role)) return null;
  return { userId, role, isAdmin: role === "admin", isMedic: role === "medic" };
}

/**
 * ¿El médico tiene relación clínica con el paciente? True si tiene al menos un
 * asiento propio (evolución, receta, orden o plan). El admin siempre.
 */
export async function medicHasRelationship(
  actor: ClinicalActor,
  patientId: string,
): Promise<boolean> {
  if (actor.isAdmin) return true;
  const [evo, rx, order, plan] = await Promise.all([
    prisma.evolution.count({
      where: { userId: actor.userId, clinicalRecord: { patientId } },
    }),
    prisma.prescription.count({ where: { userId: actor.userId, patientId } }),
    prisma.studyOrder.count({ where: { userId: actor.userId, patientId } }),
    prisma.mealPlan.count({ where: { userId: actor.userId, patientId } }),
  ]);
  return evo + rx + order + plan > 0;
}

/** ¿Puede el actor leer/editar/anular este asiento concreto? */
export function canAccessEntry(actor: ClinicalActor, entry: { userId: string }): boolean {
  return actor.isAdmin || entry.userId === actor.userId;
}

/**
 * Filtro Prisma para listados de asientos: el médico solo ve los propios.
 * Uso: `where: { patientId, ...entryScope(actor) }`.
 */
export function entryScope(actor: ClinicalActor): { userId?: string } {
  return actor.isMedic ? { userId: actor.userId } : {};
}

/** Respuesta estándar 403 para rutas clínicas. */
export const CLINICAL_FORBIDDEN = {
  success: false,
  error: "Sin acceso a datos clínicos",
} as const;
