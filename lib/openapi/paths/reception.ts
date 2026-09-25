// Recepción: llegadas sin turno (walk-ins) para la sala de espera del
// dashboard de recepción. Solo secretaria y admin. DTO en ../schemas/users.ts.
// La nota es administrativa (motivo declarado): nunca contenido clínico.

import { z } from "zod";
import { defineRoutes, errors, IdParam, IsoDateTime, ok, okEmpty, TAGS, type RouteAuth } from "../registry";
import { WalkInArrivalSchema } from "../schemas/users";

const createWalkInSchema = z.object({
  patientId: z.string().nullable().optional().describe("Ficha existente. Si viene y faltan nombre/apellido, se toman de la ficha."),
  firstName: z.string().optional().describe("Obligatorio si no hay `patientId` (o la ficha no existe)."),
  lastName: z.string().optional(),
  telephone: z.string().nullable().optional(),
  note: z.string().nullable().optional().describe("Nota administrativa (p. ej. \"pide renovación de receta\")."),
});

const updateWalkInSchema = z.object({
  markLeftNow: z.boolean().optional().describe("true: marca `leftAt` = ahora (tiene prioridad sobre `leftAt`)."),
  leftAt: IsoDateTime.nullable().optional().describe("Fecha de retiro; null para volver a ponerlo en sala."),
  assignedShiftId: z.string().nullable().optional().describe("Turno creado para esta llegada; deja de figurar como espontáneo."),
  note: z.string().nullable().optional(),
});

const RECEPTION_ROLES: RouteAuth = { kind: "session", roles: ["secretary", "admin"] };

export const receptionRoutes = defineRoutes([
  {
    method: "post",
    path: "/api/walk-ins",
    summary: "Registrar una llegada sin turno",
    description:
      "Crea el registro con `arrivedAt` = ahora. Con `patientId` y sin nombre/apellido, los completa desde la ficha. Responde **200** (no 201). No audita.",
    tags: [TAGS.shifts],
    auth: RECEPTION_ROLES,
    mobile: true,
    request: { body: createWalkInSchema },
    responses: {
      200: { description: "Llegada registrada.", schema: ok(WalkInArrivalSchema) },
      ...errors({ 400: "Faltan nombre y apellido." }, 401, 403),
    },
  },
  {
    method: "patch",
    path: "/api/walk-ins/{id}",
    summary: "Actualizar una llegada (retiró, turno asignado, nota)",
    description:
      "Actualización parcial: solo los campos presentes. Con id inexistente responde 500 (no 404): comportamiento actual.",
    tags: [TAGS.shifts],
    auth: RECEPTION_ROLES,
    mobile: true,
    request: { params: IdParam, body: updateWalkInSchema },
    responses: {
      200: { description: "Llegada actualizada.", schema: ok(WalkInArrivalSchema) },
      ...errors(401, 403, { 500: "Id inexistente o error inesperado." }),
    },
  },
  {
    method: "delete",
    path: "/api/walk-ins/{id}",
    summary: "Eliminar una llegada",
    description: "Borrado físico (es un registro operativo de recepción, no clínico). Con id inexistente responde 500.",
    tags: [TAGS.shifts],
    auth: RECEPTION_ROLES,
    mobile: true,
    request: { params: IdParam },
    responses: {
      200: { description: "Eliminada.", schema: okEmpty },
      ...errors(401, 403, { 500: "Id inexistente o error inesperado." }),
    },
  },
]);
