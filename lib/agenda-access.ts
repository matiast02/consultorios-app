// Política de edición de la agenda de un profesional: horarios de atención
// (UserPreference) y días bloqueados (BlockDay). B12 del roadmap.
//
//   - El objetivo tiene que ser un usuario activo con rol medic (la agenda es
//     de los profesionales; secretarias y admins no tienen).
//   - Editan: el propio profesional, el admin, y la secretaria (recepción
//     administra las agendas) SALVO que el profesional haya activado
//     `agendaLocked` ("solo yo modifico mi agenda"): entonces solo él y el admin.
//   - Otro médico: nunca.
//   - Sin rol conocido: nada.
//
// La lectura (GET /api/preferences, GET /api/block-days) no pasa por acá: los
// horarios no son sensibles y recepción los necesita para dar turnos.

import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { isAppRole } from "@/lib/roles";

export type AgendaAccess =
  | { ok: true; target: { id: string; agendaLocked: boolean } }
  | { ok: false; status: 403 | 404; error: string };

export const AGENDA_LOCKED_MESSAGE =
  "El profesional bloqueó la edición de su agenda: solo él o el administrador pueden modificarla";

export async function canEditAgenda(actorUserId: string, targetUserId: string): Promise<AgendaAccess> {
  const role = await getUserRole(actorUserId);
  if (!isAppRole(role)) {
    return { ok: false, status: 403, error: "Tu usuario no tiene un rol que permita editar agendas" };
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    select: {
      id: true,
      agendaLocked: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!target || !target.roles.some((r) => r.role?.name === "medic")) {
    return { ok: false, status: 404, error: "Profesional no encontrado" };
  }

  const summary = { id: target.id, agendaLocked: target.agendaLocked };
  if (actorUserId === target.id || role === "admin") return { ok: true, target: summary };
  if (role === "secretary") {
    return target.agendaLocked
      ? { ok: false, status: 403, error: AGENDA_LOCKED_MESSAGE }
      : { ok: true, target: summary };
  }
  return { ok: false, status: 403, error: "Solo podés modificar tu propia agenda" };
}
