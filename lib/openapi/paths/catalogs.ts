// Catálogos: obras sociales, especialidades, tipos de consulta y
// configuraciones de profesión. Los medicamentos (/api/medications) se
// documentan con los módulos clínicos.
//
// Los GET de listado los usa la app (formularios de alta de paciente y de
// turno); el alta/edición/baja es administración web. El chequeo de rol de
// estas rutas lee `session.user.role` (no la tabla UserRole).

import { z } from "zod";
import {
  createConsultationTypeSchema,
  createHealthInsuranceSchema,
  createSpecializationSchema,
  updateConsultationTypeSchema,
  updateHealthInsuranceSchema,
  updateSpecializationSchema,
} from "@/lib/validations";
import { defineRoutes, errors, IdParam, ok, TAGS } from "../registry";
import {
  ConsultationTypeSchema,
  HealthInsuranceDetailSchema,
  HealthInsuranceSchema,
  ProfessionConfigDetailSchema,
  ProfessionConfigSchema,
  SpecializationSchema,
} from "../schemas/catalogs";

/** Respuesta de los DELETE de catálogo: el id borrado. */
const DeletedId = z.object({ id: z.string() });

export const catalogsRoutes = defineRoutes([
  // ─── Obras sociales ────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/health-insurance",
    summary: "Listar obras sociales",
    description:
      "Todas, ordenadas por nombre, sin paginación. Es el catálogo para el alta/edición de pacientes y para las obras sociales aceptadas por cada profesional.",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Obras sociales.", schema: ok(z.array(HealthInsuranceSchema)) },
      ...errors(401),
    },
  },
  {
    method: "post",
    path: "/api/health-insurance",
    summary: "Crear una obra social",
    description: "Secretaria o admin. No controla nombres repetidos (la base no tiene unicidad por `name`).",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { body: createHealthInsuranceSchema },
    responses: {
      201: { description: "Obra social creada.", schema: ok(HealthInsuranceSchema) },
      ...errors(400, 401, 403),
    },
  },
  {
    method: "get",
    path: "/api/health-insurance/{id}",
    summary: "Obra social con sus pacientes activos",
    description: "Incluye los pacientes no archivados que la tienen como obra social principal (`osId`). Cualquier rol.",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    request: { params: IdParam },
    responses: {
      200: { description: "Obra social y pacientes.", schema: ok(HealthInsuranceDetailSchema) },
      ...errors(401, 404),
    },
  },
  {
    method: "put",
    path: "/api/health-insurance/{id}",
    summary: "Editar una obra social",
    description:
      "Secretaria o admin. Reemplazo completo: `name` es obligatorio también al editar (no es un PATCH). Verifica que exista antes de validar el body.",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { params: IdParam, body: updateHealthInsuranceSchema },
    responses: {
      200: { description: "Obra social actualizada.", schema: ok(HealthInsuranceSchema) },
      ...errors(400, 401, 403, 404),
    },
  },
  {
    method: "delete",
    path: "/api/health-insurance/{id}",
    summary: "Eliminar una obra social",
    description: [
      "Secretaria o admin. Borrado físico.",
      "Rechaza si hay pacientes no archivados con esta obra social como principal (`osId`).",
      "Las vinculaciones secundarias de pacientes (`PatientInsurance`) y las del profesional (`UserInsurance`, con copago) se borran en cascada sin aviso.",
    ].join(" "),
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { params: IdParam },
    responses: {
      200: { description: "Obra social eliminada.", schema: ok(DeletedId) },
      ...errors(401, 403, 404, { 409: "Tiene pacientes activos asociados." }),
    },
  },

  // ─── Especialidades ────────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/specializations",
    summary: "Listar especialidades",
    description:
      "Todas, ordenadas por nombre, con la configuración de profesión (etiquetas de HC, módulos) y la cantidad de profesionales. Es lo que la app necesita para el alta de usuarios y para nombrar la HC según la profesión.",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Especialidades.", schema: ok(z.array(SpecializationSchema)) },
      ...errors(401),
    },
  },
  {
    method: "post",
    path: "/api/specializations",
    summary: "Crear una especialidad",
    description: "Solo admin. El nombre es único (409 si ya existe). `color` en hex `#RRGGBB`; `professionConfigId` opcional.",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["admin"] },
    request: { body: createSpecializationSchema },
    responses: {
      201: { description: "Especialidad creada.", schema: ok(SpecializationSchema) },
      ...errors(400, 401, 403, { 409: "Ya existe una especialidad con ese nombre." }),
    },
  },
  {
    method: "get",
    path: "/api/specializations/{id}",
    summary: "Detalle de una especialidad",
    description: "Misma forma que el listado (configuración de profesión y cantidad de profesionales). Cualquier rol.",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    request: { params: IdParam },
    responses: {
      200: { description: "Especialidad.", schema: ok(SpecializationSchema) },
      ...errors(401, 404),
    },
  },
  {
    method: "put",
    path: "/api/specializations/{id}",
    summary: "Editar una especialidad",
    description:
      "Solo admin. `name` es obligatorio (no es un PATCH); `professionConfigId` y `color` se modifican solo si vienen en el body (`null` los limpia). Verifica que exista antes de validar el body; 409 si el nombre ya lo usa otra especialidad.",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["admin"] },
    request: { params: IdParam, body: updateSpecializationSchema },
    responses: {
      200: { description: "Especialidad actualizada.", schema: ok(SpecializationSchema) },
      ...errors(400, 401, 403, 404, { 409: "Ya existe otra especialidad con ese nombre." }),
    },
  },
  {
    method: "delete",
    path: "/api/specializations/{id}",
    summary: "Eliminar una especialidad",
    description: "Solo admin. Borrado físico; rechaza si tiene profesionales asociados.",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["admin"] },
    request: { params: IdParam },
    responses: {
      200: { description: "Especialidad eliminada.", schema: ok(DeletedId) },
      ...errors(401, 403, 404, { 409: "Tiene profesionales asociados." }),
    },
  },

  // ─── Tipos de consulta ─────────────────────────────────────────────────────
  {
    method: "get",
    path: "/api/consultation-types",
    summary: "Listar tipos de consulta",
    description:
      "Todos, ordenados por nombre, con la cantidad de turnos que usan cada uno. El que tiene `isDefault` es el que la app debería preseleccionar al crear un turno; `durationMinutes` sirve para calcular `end`.",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Tipos de consulta.", schema: ok(z.array(ConsultationTypeSchema)) },
      ...errors(401),
    },
  },
  {
    method: "post",
    path: "/api/consultation-types",
    summary: "Crear un tipo de consulta",
    description:
      "Secretaria o admin. El nombre es único (409). Si `isDefault` es true, desmarca el default anterior antes de crear.",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { body: createConsultationTypeSchema },
    responses: {
      201: { description: "Tipo de consulta creado.", schema: ok(ConsultationTypeSchema) },
      ...errors(400, 401, 403, { 409: "Ya existe un tipo de consulta con ese nombre." }),
    },
  },
  {
    method: "put",
    path: "/api/consultation-types/{id}",
    summary: "Editar un tipo de consulta",
    description:
      "Secretaria o admin. Actualización parcial: solo se tocan los campos enviados. Verifica que exista antes de validar el body; 409 si el nombre nuevo ya lo usa otro tipo. `isDefault: true` desmarca los demás.",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { params: IdParam, body: updateConsultationTypeSchema },
    responses: {
      200: { description: "Tipo de consulta actualizado.", schema: ok(ConsultationTypeSchema) },
      ...errors(400, 401, 403, 404, { 409: "Ya existe otro tipo de consulta con ese nombre." }),
    },
  },
  {
    method: "delete",
    path: "/api/consultation-types/{id}",
    summary: "Eliminar un tipo de consulta",
    description: "Secretaria o admin. Borrado físico; rechaza si algún turno (de cualquier estado) lo usa.",
    tags: [TAGS.catalogs],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    request: { params: IdParam },
    responses: {
      200: { description: "Tipo de consulta eliminado.", schema: ok(DeletedId) },
      ...errors(401, 403, 404, { 409: "Tiene turnos asociados." }),
    },
  },

  // ─── Configuraciones de profesión ──────────────────────────────────────────
  {
    method: "get",
    path: "/api/profession-configs",
    summary: "Listar configuraciones de profesión",
    description:
      "Todas, ordenadas por nombre, con la cantidad de especialidades que las usan. Definen las etiquetas de la HC por profesión (evolución, receta, ficha, tratamiento del profesional) y los módulos habilitados. No hay rutas de alta/edición: se cargan por seed.",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    mobile: true,
    responses: {
      200: { description: "Configuraciones de profesión.", schema: ok(z.array(ProfessionConfigSchema)) },
      ...errors(401),
    },
  },
  {
    method: "get",
    path: "/api/profession-configs/{id}",
    summary: "Configuración de profesión con sus especialidades",
    description: "Incluye las especialidades asociadas (ordenadas por nombre) con la cantidad de profesionales de cada una. Cualquier rol.",
    tags: [TAGS.catalogs],
    auth: { kind: "session" },
    request: { params: IdParam },
    responses: {
      200: { description: "Configuración y especialidades.", schema: ok(ProfessionConfigDetailSchema) },
      ...errors(401, 404),
    },
  },
]);
