// Dashboards: /api/dashboard/{medic,secretary,admin}, /api/stats.
// Cada dashboard es una sola llamada que devuelve todo lo que muestra la home
// del rol. Las fechas "de hoy" se calculan con la hora del servidor.

import { statsQuerySchema } from "@/lib/validations";
import { defineRoutes, errors, ok, TAGS } from "../registry";
import { AdminDashboardSchema, MedicDashboardSchema, SecretaryDashboardSchema, StatsSchema } from "../schemas/dashboards";

export const dashboardsRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/dashboard/medic",
    summary: "Dashboard del médico",
    description: [
      "Solo médicos (secretaria y admin reciben 403). Todo es del médico logueado:",
      "- `today`: sus turnos de hoy con paciente, obra social y tipo de consulta, el próximo a atender y contadores.",
      "- `week`: turnos por día de la semana actual (lunes a domingo).",
      "- `pendientes`: evoluciones sin cerrar (7 días), recetas para renovar, órdenes de estudio pendientes y solicitudes de acceso a la HC que puede decidir.",
      "- `recentPatients`: últimos 5 pacientes atendidos.",
      "Sin contenido clínico (los `summary` solo llevan nombres, fechas y conteos).",
    ].join("\n"),
    tags: [TAGS.dashboard],
    auth: { kind: "session", roles: ["medic"] },
    mobile: true,
    responses: {
      200: { description: "Datos del dashboard.", schema: ok(MedicDashboardSchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "get",
    path: "/api/dashboard/secretary",
    summary: "Dashboard de recepción",
    description: [
      "Recepción (secretaria) o admin; los médicos reciben 403. Vista de todo el consultorio para hoy:",
      "- `salaDeEspera` y `proximoALlamar`: pacientes con llegada registrada y espontáneos, con minutos de espera.",
      "- `recordatorios`: los recordatorios de los turnos de **mañana** (con `waLink` para los WhatsApp manuales).",
      "- `huecosHoy`: huecos libres restantes por médico según su horario de atención.",
      "- `agenda`: turnos de hoy por profesional activo y un `autoMode` de layout sugerido.",
      "- `reservasOnline`: reservas web pendientes de confirmar (las 5 más antiguas); puede faltar si ese bloque falló.",
      "Pensado para polling: cada respuesta trae `header.now`. Sin contenido clínico.",
    ].join("\n"),
    tags: [TAGS.dashboard],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    responses: {
      200: { description: "Datos del dashboard.", schema: ok(SecretaryDashboardSchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "get",
    path: "/api/dashboard/admin",
    summary: "Dashboard del administrador",
    description: [
      "Solo admin. Indicadores del consultorio: turnos y ocupación de hoy, logins fallidos de 24 h, ausentismo del mes, últimos 20 eventos del audit log, salud del catálogo (pacientes incompletos, médicos sin horarios, copias de HC pendientes, módulos), tendencias de 8 semanas / 6 meses / 30 días y usuarios por rol.",
      "Cada acceso queda auditado como `VIEW_SENSITIVE` sobre `admin_dashboard`.",
    ].join("\n\n"),
    tags: [TAGS.dashboard],
    auth: { kind: "session", roles: ["admin"] },
    responses: {
      200: { description: "Datos del dashboard.", schema: ok(AdminDashboardSchema) },
      ...errors(401, 403),
    },
  },
  {
    method: "get",
    path: "/api/stats",
    summary: "Estadísticas de turnos por período",
    description: [
      "Cualquier rol (no filtra por el médico logueado: `userId` es opcional y libre). Período: el mes indicado (`month` + `year`) o el año completo (`year`, default: el actual).",
      "`byMonth` siempre cubre los 12 meses del año aunque se filtre por mes; `totalPatients` es de todo el consultorio.",
    ].join("\n\n"),
    tags: [TAGS.stats],
    auth: { kind: "session" },
    request: { query: statsQuerySchema },
    responses: {
      200: { description: "Estadísticas del período.", schema: ok(StatsSchema) },
      ...errors(400, 401),
    },
  },
]);
