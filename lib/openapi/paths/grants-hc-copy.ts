// Concesiones de acceso a la HC (ClinicalAccessGrant, Ley 26.529 art. 19 inc. d)
// y copia de la HC para el paciente (HcCopyRequest, arts. 14 y 19).
//
// Concesiones: un médico SIN relación con el paciente solicita acceso; lo decide
// un médico tratante o el admin registrando el consentimiento del paciente; la
// concesión vigente es de solo lectura, acotada (FULL o PARTIAL por secciones /
// asientos) y en el tiempo (default 30 días, máximo 180); revocable.
// Copia de HC: recepción registra la solicitud (48 h para entregar); el PDF lo
// genera solo un rol clínico y lleva los hashes del ledger.

import { z } from "zod";
import {
  accessGrantActionSchema,
  accessGrantsQuerySchema,
  createAccessGrantSchema,
  createHcCopyRequestSchema,
  deliverHcCopySchema,
  hcCopyRequestsQuerySchema,
} from "@/lib/validations";
import { GRANT_DEFAULT_DAYS, GRANT_MAX_DAYS } from "@/lib/clinical-grants-shared";
import { defineRoutes, errors, IdParam, ok, PatientIdParam, TAGS } from "../registry";
import {
  ClinicalAccessGrantSchema,
  ClinicalAccessStatusSchema,
  HcCopyRequestSchema,
  HcCopyRequestsListSchema,
} from "../schemas/clinical";

const HcCopyRequestParams = PatientIdParam.extend({
  requestId: z.string().describe("ID de la solicitud de copia (debe ser del paciente `id`)."),
});

/** Quién ve una concesión: beneficiario, tratante del paciente, quien la decidió, admin. */
const grantVisibility =
  "Ve una concesión su beneficiario, un médico tratante del paciente, quien la decidió y el admin; para cualquier otro no existe (404).";

export const grantsAndHcCopyRoutes = defineRoutes([
  // ─── Concesiones ───────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/clinical-access-grants",
    summary: "Listar concesiones (recibidas y/o a decidir)",
    description: [
      "Médico: sus solicitudes/concesiones (`box=received`) y las de otros médicos sobre pacientes que trata (`box=to-decide`); sin `box`, ambas.",
      "Admin: todas (con `box=to-decide`, las ajenas). `box=to-decide` sin `status` filtra las PENDING.",
      "`status` filtra por estado efectivo (`ACTIVE` = vigente ahora; `EXPIRED` incluye las ACTIVE ya vencidas). Hasta 200, más recientes primero.",
      "Cada ítem trae `permissions` con lo que el actor puede hacer. No devuelve datos clínicos (sin `VIEW_SENSITIVE`).",
    ].join(" "),
    tags: [TAGS.grants],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { query: accessGrantsQuerySchema },
    responses: {
      200: { description: "Concesiones visibles para el actor.", schema: ok(z.array(ClinicalAccessGrantSchema)) },
      ...errors(400, 401, 403),
    },
  },
  {
    method: "post",
    path: "/api/clinical-access-grants",
    summary: "Solicitar acceso a la HC de un paciente",
    description: [
      "Solo un médico que NO sea tratante del paciente. Nace PENDING; la decide un tratante o el admin (`PATCH`).",
      "`scope: FULL` ignora `sections`/`entryIds`; con `PARTIAL` hay que indicar al menos una sección o un asiento, y los `entryIds` deben ser asientos de ese paciente.",
      "Solo puede haber una solicitud pendiente o una concesión vigente por médico y paciente (409). Audita `REQUEST_ACCESS` sin el motivo (queda cifrado).",
    ].join(" "),
    tags: [TAGS.grants],
    auth: { kind: "session", roles: ["medic"] },
    mobile: true,
    request: { body: createAccessGrantSchema },
    responses: {
      201: { description: "Solicitud creada (PENDING).", schema: ok(ClinicalAccessGrantSchema) },
      ...errors(
        { 400: "Datos inválidos, o algún `entryIds` no pertenece al paciente." },
        401,
        { 403: "Sin rol clínico o no es médico." },
        { 404: "Paciente inexistente o archivado." },
        { 409: "Ya es tratante del paciente, ya tiene una solicitud pendiente o ya tiene un acceso vigente." },
      ),
    },
  },
  {
    method: "patch",
    path: "/api/clinical-access-grants/{id}",
    summary: "Aprobar, rechazar, revocar o cancelar una concesión",
    description: [
      `${grantVisibility} Transiciones por \`action\`:`,
      "`approve` (PENDING → ACTIVE): admin o médico tratante, nunca el beneficiario; exige `consentType` y opcionalmente `consentEvidence`, `consentAt` (no futura) y `days`",
      `(default ${GRANT_DEFAULT_DAYS}, máximo ${GRANT_MAX_DAYS}); \`startsAt\` = ahora. Falla si el paciente está archivado o el médico ya tiene otro acceso vigente. Audita \`GRANT_ACCESS\`.`,
      "`reject` (PENDING → REJECTED): mismos decisores; `decisionNote` obligatoria. Audita `REQUEST_ACCESS`.",
      "`revoke` (ACTIVE → REVOKED): admin, tratante o quien la aprobó; no el beneficiario. Audita `GRANT_ACCESS`.",
      "`cancel`: solo el beneficiario; su PENDING pasa a REJECTED y su vigente a REVOKED.",
      "La actualización es condicional al estado leído: dos decisiones concurrentes → la segunda recibe 409.",
    ].join(" "),
    tags: [TAGS.grants],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: IdParam, body: accessGrantActionSchema },
    responses: {
      200: { description: "Concesión con el nuevo estado y `permissions` recalculados.", schema: ok(ClinicalAccessGrantSchema) },
      ...errors(
        400,
        401,
        { 403: "La acción no corresponde al actor (decidir la propia, revocar la propia, cancelar la ajena, no ser tratante ni admin)." },
        { 404: "Concesión inexistente o no visible para el actor (respuesta idéntica)." },
        { 409: "Estado incompatible con la acción (ya resuelta, no vigente, paciente archivado, otro acceso vigente) o cambió mientras se procesaba." },
      ),
    },
  },
  {
    method: "get",
    path: "/api/patients/{id}/clinical-access",
    summary: "Estado de acceso del usuario a la HC del paciente",
    description: [
      "Para armar la pantalla del paciente: si el actor es tratante o admin (`hasRelationship`, `canDecide`), qué secciones de la ficha ve (`record`),",
      "su concesión vigente y su solicitud pendiente (si las hay), si puede solicitar acceso (`canRequest`) y cuántas solicitudes ajenas tiene para decidir.",
      "No devuelve datos clínicos: sin `VIEW_SENSITIVE`.",
    ].join(" "),
    tags: [TAGS.grants],
    auth: { kind: "session", roles: ["medic", "admin"] },
    mobile: true,
    request: { params: PatientIdParam },
    responses: {
      200: { description: "Estado de acceso del actor.", schema: ok(ClinicalAccessStatusSchema) },
      ...errors(401, 403, { 404: "Paciente inexistente o archivado." }),
    },
  },

  // ─── Copia de HC para el paciente ──────────────────────────────────────────
  {
    method: "get",
    path: "/api/hc-copy-requests",
    summary: "Solicitudes de copia de HC de todos los pacientes (dashboard)",
    description:
      "Solo admin. Filtra por `status` (default PENDING): las pendientes se ordenan por vencimiento, el resto por fecha de solicitud. Solo datos administrativos (sin notas cifradas ni contenido clínico); `count` es el total del estado y `overdue` cuántas pendientes vencieron el plazo de 48 h.",
    tags: [TAGS.hcCopy, TAGS.dashboard],
    auth: { kind: "session", roles: ["admin"] },
    request: { query: hcCopyRequestsQuerySchema },
    responses: {
      200: { description: "Resumen de solicitudes.", schema: ok(HcCopyRequestsListSchema) },
      ...errors(400, 401, { 403: "Solo administradores (`code: FORBIDDEN`)." }),
    },
  },
  {
    method: "get",
    path: "/api/patients/{id}/hc-copy-requests",
    summary: "Solicitudes de copia de HC del paciente",
    description:
      "Admin, médico o secretaria (recepción atiende el mostrador). Incluye pacientes archivados. Más recientes primero. Son datos administrativos de la solicitud, no contenido clínico.",
    tags: [TAGS.hcCopy],
    auth: { kind: "session", roles: ["medic", "secretary", "admin"] },
    mobile: true,
    request: { params: PatientIdParam },
    responses: {
      200: { description: "Solicitudes del paciente.", schema: ok(z.array(HcCopyRequestSchema)) },
      ...errors(401, { 403: "Rol sin permiso (`code: FORBIDDEN`)." }, { 404: "Paciente inexistente." }),
    },
  },
  {
    method: "post",
    path: "/api/patients/{id}/hc-copy-requests",
    summary: "Registrar una solicitud de copia de HC",
    description: [
      "Admin, médico o secretaria. Ley 26.529 art. 14: la copia debe entregarse dentro de las 48 h (`dueAt` = ahora + 48 h).",
      "Art. 19: si no la pide el propio paciente (`requesterType` distinto de PATIENT), `authorizationNote` es obligatoria para dejar constancia de cómo se acreditó el vínculo o la autorización.",
      "Acepta pacientes archivados. Audita `CREATE` solo con `patientId` y `requesterType`.",
    ].join(" "),
    tags: [TAGS.hcCopy],
    auth: { kind: "session", roles: ["medic", "secretary", "admin"] },
    mobile: true,
    request: { params: PatientIdParam, body: createHcCopyRequestSchema },
    responses: {
      201: { description: "Solicitud registrada (PENDING).", schema: ok(HcCopyRequestSchema) },
      ...errors({ 400: "JSON inválido o datos inválidos (p. ej. falta `authorizationNote`)." }, 401, { 403: "Rol sin permiso (`code: FORBIDDEN`)." }, { 404: "Paciente inexistente." }),
    },
  },
  {
    method: "post",
    path: "/api/patients/{id}/hc-copy-requests/{requestId}/cancel",
    summary: "Cancelar una solicitud de copia pendiente",
    description:
      "Admin, médico o secretaria. Solo sobre PENDING (409 `NOT_PENDING` si ya fue entregada o cancelada; actualización condicional ante concurrencia). Sin body. Audita `UPDATE`.",
    tags: [TAGS.hcCopy],
    auth: { kind: "session", roles: ["medic", "secretary", "admin"] },
    mobile: true,
    request: { params: HcCopyRequestParams },
    responses: {
      200: { description: "Solicitud cancelada.", schema: ok(HcCopyRequestSchema) },
      ...errors(401, { 403: "Rol sin permiso (`code: FORBIDDEN`)." }, { 404: "Solicitud inexistente o de otro paciente." }, { 409: "Ya entregada o ya cancelada (`code: NOT_PENDING`)." }),
    },
  },
  {
    method: "post",
    path: "/api/patients/{id}/hc-copy-requests/{requestId}/deliver",
    summary: "Generar el PDF de la copia de la HC y marcar la entrega",
    description: [
      "Solo admin o médico (la secretaria registra la solicitud pero nunca ve contenido clínico). Devuelve el PDF de la HC completa del paciente",
      "(ficha, evoluciones, recetas, órdenes, planes, adjuntos, concesiones) con los hashes del ledger; el header `X-Document-Hash` es el sha256 del contenido canónico.",
      "Si la solicitud está PENDING la marca DELIVERED (`deliveredAt`, `deliveredBy`, `deliveryNote`, `documentHash`); si ya estaba DELIVERED la reemite sin tocar la entrega original.",
      "El PDF se genera antes de marcar la entrega: si falla, la solicitud sigue PENDING. Body JSON opcional. Audita `EXPORT_HC` y `VIEW_SENSITIVE`.",
    ].join(" "),
    tags: [TAGS.hcCopy],
    auth: { kind: "session", roles: ["medic", "admin"] },
    request: {
      params: HcCopyRequestParams,
      body: deliverHcCopySchema,
      bodyDescription: "Opcional (puede ir vacío): cómo se entregó la copia.",
    },
    responses: {
      200: {
        description: "PDF de la copia (`Content-Disposition: attachment`, `X-Document-Hash`, `Cache-Control: no-store`).",
        contentType: "application/pdf",
      },
      ...errors({ 400: "JSON inválido o `deliveryNote` demasiado larga." }, 401, { 403: "Rol sin permiso (`code: FORBIDDEN`)." }, { 404: "Solicitud inexistente, de otro paciente, o paciente inexistente." }, { 409: "La solicitud está cancelada (`code: CANCELLED`)." }),
    },
  },
]);
