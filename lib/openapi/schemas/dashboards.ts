// DTO de los dashboards por rol y de /api/stats. La forma es la que ARMAN las
// rutas app/api/dashboard/*/route.ts y app/api/stats/route.ts (no siempre
// coincide con types/index.ts: acá manda lo que viaja por la red).
//
// Los sub-objetos llevan `ref` propio para que el cliente Dart tenga clases con
// nombre (DashboardShift, WaitingRoomItem, AdminStats, …).

import { z } from "zod";
import { IsoDate, IsoDateTime } from "../registry";
import { AuditEventSchema } from "./audit";
import { ShiftStatusSchema } from "./shifts";
import { ReminderItemSchema } from "./reminders";
import { SecretaryOnlineBookingsSchema } from "./online-booking";

// ─── Comunes ─────────────────────────────────────────────────────────────────

const hhmm = z.string().regex(/^\d{2}:\d{2}$/).openapi({ example: "09:30" });

/** Color hex de la especialidad del profesional (para puntos y barras). */
const specialtyColor = z.string().nullable().describe("Color de la especialidad; null si no tiene.");

// ─── Dashboard del médico ────────────────────────────────────────────────────

export const DashboardShiftPatientSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    telephone: z.string().nullable(),
    os: z.object({ id: z.string(), name: z.string(), code: z.string().nullable() }).nullable().describe("Obra social."),
  })
  .openapi({ ref: "DashboardShiftPatient" });

export const DashboardShiftSchema = z
  .object({
    id: z.string(),
    start: IsoDateTime,
    end: IsoDateTime,
    status: ShiftStatusSchema,
    observations: z.string().nullable().describe("Nota ADMINISTRATIVA del turno (la ve recepción); no es contenido clínico."),
    isOverbook: z.boolean().describe("Sobreturno."),
    durationMinutes: z.number().int(),
    patient: DashboardShiftPatientSchema.nullable(),
    consultationType: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
    arrivedAt: IsoDateTime.nullable().describe("Llegada registrada por recepción (sala de espera)."),
    consultationStartedAt: IsoDateTime.nullable().describe("Pase a consulta / llamado."),
    minutesWaiting: z
      .number()
      .int()
      .nullable()
      .describe("Minutos en sala (llegó y todavía no pasó a consulta); null en otro caso."),
    ticketNumber: z
      .number()
      .int()
      .nullable()
      .describe("Número de sala del día (módulo `waiting_room`); null sin módulo o sin número."),
  })
  .openapi({ ref: "DashboardShift" });

export const DashboardTodayStatsSchema = z
  .object({
    total: z.number().int().describe("Turnos de hoy, incluidos cancelados."),
    atendidos: z.number().int().describe("FINISHED."),
    porVenir: z.number().int().describe("PENDING + CONFIRMED (aunque su hora ya haya pasado)."),
    confirmados: z.number().int().describe("CONFIRMED."),
    ausentes: z.number().int().describe("ABSENT."),
    pendientes: z.number().int().describe("PENDING."),
  })
  .openapi({ ref: "DashboardTodayStats" });

export const DashboardTodaySchema = z
  .object({
    date: IsoDateTime.describe("Medianoche de hoy (hora del servidor)."),
    shifts: z.array(DashboardShiftSchema).describe("Todos los turnos de hoy del médico, por hora ascendente."),
    nextShift: DashboardShiftSchema.nullable().describe("Primer PENDING/CONFIRMED con inicio posterior a ahora; null si no queda ninguno."),
    stats: DashboardTodayStatsSchema,
  })
  .openapi({ ref: "DashboardToday" });

export const DashboardWeekDaySchema = z
  .object({
    date: IsoDateTime.describe("Medianoche de ese día."),
    count: z.number().int().describe("Turnos ese día (todos los estados)."),
    dayLabel: z.enum(["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"]),
    dayNumber: z.number().int().min(1).max(31),
    isToday: z.boolean(),
  })
  .openapi({ ref: "DashboardWeekDay" });

export const DashboardWeekSchema = z
  .object({
    totalShifts: z.number().int(),
    weekStart: IsoDateTime.describe("Lunes de la semana actual, 00:00."),
    weekEnd: IsoDateTime.describe("Lunes siguiente, 00:00 (exclusivo)."),
    byDay: z.array(DashboardWeekDaySchema).length(7).describe("Lunes a domingo."),
  })
  .openapi({ ref: "DashboardWeek" });

export const DashboardPendienteItemSchema = z
  .object({
    count: z.number().int(),
    summary: z.string().describe("Texto corto para la tarjeta (español)."),
  })
  .openapi({ ref: "DashboardPendienteItem" });

export const DashboardPendientesSchema = z
  .object({
    evolucionesSinCerrar: DashboardPendienteItemSchema.describe("Turnos FINISHED de los últimos 7 días sin evolución."),
    recetasParaRenovar: DashboardPendienteItemSchema.describe("Recetas vencidas en los últimos 7 días o por vencer en 14 (según `durationDays`)."),
    estudiosPendientes: DashboardPendienteItemSchema.describe("Órdenes de estudio PENDING del médico; el `summary` describe la más antigua."),
    solicitudesDeAcceso: DashboardPendienteItemSchema.extend({
      patientId: z.string().nullable().describe("Paciente de la solicitud más antigua (para abrir su ficha); null si no hay."),
    }).describe("Solicitudes de acceso a la HC (ajenas, PENDING) sobre pacientes que este médico trata y puede decidir."),
  })
  .openapi({ ref: "DashboardPendientes" });

export const DashboardRecentPatientSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    initials: z.string().describe("Iniciales en mayúsculas, p. ej. \"JP\"."),
    lastShiftType: z.string().nullable().describe("Nombre del tipo de consulta del último turno."),
    lastShiftTime: IsoDateTime.describe("Inicio del último turno FINISHED."),
  })
  .openapi({ ref: "DashboardRecentPatient" });

export const MedicWaitingRoomSchema = z
  .object({
    enabled: z.boolean().describe("Módulo «Sala de espera y llamado» (`waiting_room`) activo: el médico puede llamar desde sus turnos de hoy."),
    room: z.string().nullable().describe("Consultorio habitual del médico (`defaultRoom`), para prellenar el llamado."),
  })
  .openapi({ ref: "MedicWaitingRoom" });

export const MedicDashboardSchema = z
  .object({
    today: DashboardTodaySchema,
    week: DashboardWeekSchema,
    pendientes: DashboardPendientesSchema,
    recentPatients: z.array(DashboardRecentPatientSchema).max(5).describe("Últimos 5 pacientes atendidos (turnos FINISHED pasados), sin repetir."),
    waitingRoom: MedicWaitingRoomSchema,
  })
  .openapi({ ref: "MedicDashboard" });

// ─── Dashboard de recepción ──────────────────────────────────────────────────

export const SecretaryHeaderSchema = z
  .object({
    secretaryName: z.string().describe('Nombre y apellido del usuario logueado; "Recepción" si no tiene.'),
    now: IsoDateTime.describe("Hora del servidor al generar la respuesta."),
    activeProfessionalsCount: z.number().int().describe("Médicos activos con turnos hoy o con horario de atención configurado para hoy."),
  })
  .openapi({ ref: "SecretaryHeader" });

export const SecretaryStatsSchema = z
  .object({
    enSalaDeEspera: z.number().int().describe("Turnos con llegada registrada sin iniciar consulta + espontáneos en espera."),
    enConsulta: z.number().int().describe("Turnos con consulta iniciada y no terminada."),
    esperandoMas15: z.number().int().describe("De los que esperan, cuántos llevan más de 15 minutos."),
    huecosHoy: z.number().int().describe("Total de huecos libres de hoy (suma de `huecosHoy[].count`)."),
  })
  .openapi({ ref: "SecretaryStats" });

export const WaitingRoomKindSchema = z
  .enum(["scheduled", "walkin"])
  .openapi({ ref: "WaitingRoomKind", description: "scheduled: turno con llegada registrada; walkin: paciente espontáneo (WalkInArrival) sin turno asignado." });

export const WaitingRoomItemPatientSchema = z
  .object({
    id: z.string().nullable().describe("null en espontáneos sin ficha."),
    firstName: z.string(),
    lastName: z.string(),
    telephone: z.string().nullable(),
    osShort: z.string().nullable().describe('Obra social abreviada ("OSDE", "PART", …); null en espontáneos.'),
  })
  .openapi({ ref: "WaitingRoomItemPatient" });

export const WaitingRoomItemShiftSchema = z
  .object({
    id: z.string(),
    start: IsoDateTime,
    durationMinutes: z.number().int(),
    medicId: z.string(),
    medicShortName: z.string(),
    medicColor: specialtyColor,
    consultationTypeName: z.string().nullable(),
    room: z.string().nullable().describe("Consultorio habitual del profesional (prellena el llamado)."),
  })
  .openapi({ ref: "WaitingRoomItemShift" });

export const WaitingRoomItemSchema = z
  .object({
    id: z.string().describe("Id del turno (scheduled) o de la llegada espontánea (walkin)."),
    kind: WaitingRoomKindSchema,
    arrivedAt: IsoDateTime,
    minutesWaiting: z.number().int(),
    isNext: z.boolean().describe("Es el próximo a llamar (turno con llegada registrada de hora más temprana)."),
    ticketNumber: z
      .number()
      .int()
      .nullable()
      .describe("Número de sala del día (módulo `waiting_room`); null con el módulo apagado."),
    note: z.string().nullable().describe("Observación administrativa del turno o nota de la llegada espontánea."),
    patient: WaitingRoomItemPatientSchema,
    shift: WaitingRoomItemShiftSchema.nullable().describe("null en espontáneos."),
  })
  .openapi({ ref: "WaitingRoomItem" });

export const NextToCallSchema = z
  .object({
    waitingRoomId: z.string().describe("Id del `WaitingRoomItem` correspondiente."),
    kind: WaitingRoomKindSchema.describe("Hoy siempre `scheduled`: los espontáneos no se proponen como próximos."),
    patient: z.object({ firstName: z.string(), lastName: z.string() }),
    medicShortName: z.string(),
    medicColor: specialtyColor,
    room: z.string().nullable().describe("Consultorio por defecto del profesional."),
    shiftStart: IsoDateTime.nullable(),
    minutesWaiting: z.number().int(),
    ticketNumber: z
      .number()
      .int()
      .nullable()
      .describe("Número de sala del día (módulo `waiting_room`); null con el módulo apagado."),
  })
  .openapi({ ref: "NextToCall" });

export const CalledItemSchema = z
  .object({
    shiftId: z.string(),
    patient: z.object({ id: z.string().nullable(), firstName: z.string(), lastName: z.string() }),
    medicId: z.string(),
    medicShortName: z.string(),
    medicColor: specialtyColor,
    room: z.string().nullable().describe("Consultorio del llamado (ticket) o el habitual del profesional."),
    calledAt: IsoDateTime.describe("Último llamado (`lastCalledAt` del ticket, o `consultationStartedAt` sin número)."),
    minutesSinceCall: z.number().int(),
    ticketNumber: z.number().int().nullable(),
    callCount: z.number().int().describe("Cantidad de llamados; 0 si no tiene número."),
  })
  .openapi({ ref: "CalledItem" });

export const SecretaryWaitingRoomSchema = z
  .object({
    enabled: z
      .boolean()
      .describe(
        "Módulo «Sala de espera y llamado» (`waiting_room`) activo: las llegadas emiten número de sala y los ítems traen `ticketNumber`.",
      ),
  })
  .openapi({ ref: "SecretaryWaitingRoom" });

export const SecretaryRemindersSchema = z
  .object({
    context: z.enum(["today", "tomorrow"]).describe("Hoy siempre `tomorrow`: son los recordatorios de los turnos de mañana."),
    total: z.number().int(),
    pending: z.number().int().describe("Con `status: PENDING` (incluye los WhatsApp manuales por enviar)."),
    sent: z.number().int().describe("Con `status: SENT`."),
    items: z.array(ReminderItemSchema).describe("Por hora del turno y mayor anticipación primero."),
  })
  .openapi({ ref: "SecretaryReminders" });

export const MedicSlotSchema = z
  .object({
    time: hhmm.describe("Inicio del hueco, hora local del servidor."),
    durationMinutes: z.number().int(),
  })
  .openapi({ ref: "MedicSlot" });

export const MedicSlotsGroupSchema = z
  .object({
    medicId: z.string(),
    medicShortName: z.string(),
    dotColor: specialtyColor,
    count: z.number().int(),
    slots: z.array(MedicSlotSchema).describe("Huecos libres restantes de hoy (posteriores a ahora) según el horario de atención y la duración de turno del médico."),
  })
  .openapi({ ref: "MedicSlotsGroup" });

export const AgendaAutoModeSchema = z
  .enum(["columns-detailed", "columns-compact", "rails"])
  .openapi({ ref: "AgendaAutoMode", description: "Sugerencia de layout según la cantidad de profesionales activos: ≤ 2 detallado, ≤ 5 compacto, más → rieles." });

export const AgendaShiftMiniSchema = z
  .object({
    id: z.string(),
    start: IsoDateTime,
    end: IsoDateTime,
    status: ShiftStatusSchema,
    patientShortName: z.string().describe('"Apellido, N." (inicial del nombre).'),
    consultationTypeName: z.string().nullable(),
    isWalkIn: z.boolean().describe("Sobreturno (`isOverbook`)."),
  })
  .openapi({ ref: "AgendaShiftMini" });

export const AgendaProfessionalSchema = z
  .object({
    id: z.string(),
    shortName: z.string(),
    especialidad: z.string().nullable(),
    room: z.string().nullable(),
    dotColor: specialtyColor,
    isPinned: z.boolean().describe("Reservado para fijar columnas; hoy siempre false."),
    turnSegments: z.array(z.enum(["AM", "PM"])).describe("Franjas con horario de atención configurado hoy."),
    hasWaitingPatients: z.boolean(),
    hasFreeSlots: z.boolean(),
    shifts: z.array(AgendaShiftMiniSchema).describe("Turnos de hoy del profesional, todos los estados."),
  })
  .openapi({ ref: "AgendaProfessional" });

export const SecretaryAgendaSchema = z
  .object({
    autoMode: AgendaAutoModeSchema,
    profesionales: z.array(AgendaProfessionalSchema).describe("Solo los médicos activos hoy (con turnos u horario configurado)."),
    totalShifts: z.number().int().describe("Turnos de hoy de todo el consultorio."),
  })
  .openapi({ ref: "SecretaryAgenda" });

export const SecretaryDashboardSchema = z
  .object({
    header: SecretaryHeaderSchema,
    stats: SecretaryStatsSchema,
    salaDeEspera: z.array(WaitingRoomItemSchema).describe("Quien más espera, primero."),
    proximoALlamar: NextToCallSchema.nullable(),
    recordatorios: SecretaryRemindersSchema,
    huecosHoy: z.array(MedicSlotsGroupSchema).describe("Solo médicos con al menos un hueco; ordenados por su primer hueco. Excluye médicos con día bloqueado."),
    agenda: SecretaryAgendaSchema,
    llamados: z.array(CalledItemSchema).describe("Pacientes en consulta (ya llamados) hoy, el último llamado primero."),
    waitingRoom: SecretaryWaitingRoomSchema,
    reservasOnline: SecretaryOnlineBookingsSchema.optional().describe("Ausente si el resumen de reservas online falló (el resto del dashboard se sirve igual)."),
  })
  .openapi({ ref: "SecretaryDashboard" });

// ─── Dashboard del admin ─────────────────────────────────────────────────────

export const AdminHeaderSchema = z
  .object({
    adminName: z.string(),
    now: IsoDateTime,
    totalUsers: z.number().int().describe("Usuarios activos no borrados."),
    totalPatients: z.number().int().describe("Pacientes no archivados."),
  })
  .openapi({ ref: "AdminHeader" });

export const AdminStatTodayShiftsSchema = z
  .object({
    value: z.number().int().describe("Turnos de hoy (todos los médicos y estados)."),
    deltaPctVsYesterday: z.number().nullable().describe("Variación % contra ayer, 1 decimal; null si ayer hubo 0."),
  })
  .openapi({ ref: "AdminStatTodayShifts" });

export const AdminStatOccupancySchema = z
  .object({
    used: z.number().int().describe("Turnos de hoy no cancelados."),
    total: z.number().int().describe("Capacidad: huecos del horario de hoy de los médicos activos según su duración de turno."),
    pct: z.number().describe("used / total × 100, 1 decimal; 0 si `total` es 0."),
  })
  .openapi({ ref: "AdminStatOccupancy" });

export const AdminStatFailedLoginsSchema = z
  .object({
    value: z.number().int().describe("LOGIN_FAILED en las últimas 24 h."),
    blockedCount: z.number().int().describe("LOGIN_BLOCKED en las últimas 24 h."),
    deltaPctVs7dAvg: z.number().nullable().describe("Variación % contra el promedio diario de los 7 días anteriores; null si ese promedio es 0."),
  })
  .openapi({ ref: "AdminStatFailedLogins" });

export const AdminStatNoShowSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/).openapi({ example: "2026-09" }),
    pct: z.number().describe("ABSENT / (FINISHED + ABSENT + CANCELLED) del mes × 100, 1 decimal."),
    absent: z.number().int(),
    total: z.number().int().describe("Turnos del mes ya resueltos (FINISHED + ABSENT + CANCELLED)."),
    deltaPctVsPrevMonth: z.number().nullable().describe("Diferencia en PUNTOS porcentuales contra el mes anterior; null si el mes anterior no tuvo turnos resueltos."),
  })
  .openapi({ ref: "AdminStatNoShow" });

export const AdminStatsSchema = z
  .object({
    todayShifts: AdminStatTodayShiftsSchema,
    occupancyToday: AdminStatOccupancySchema,
    failedLogins24h: AdminStatFailedLoginsSchema,
    noShowRateMonth: AdminStatNoShowSchema,
  })
  .openapi({ ref: "AdminStats" });

export const CatalogPatientsIncompleteSchema = z
  .object({
    missingDni: z.number().int(),
    missingPhone: z.number().int(),
    missingHealthInsurance: z.number().int(),
    total: z.number().int().describe("Pacientes con al menos un faltante (no es la suma de los anteriores)."),
  })
  .openapi({ ref: "CatalogPatientsIncomplete" });

export const CatalogMedicRefSchema = z.object({ id: z.string(), name: z.string() }).openapi({ ref: "CatalogMedicRef" });

export const ModuleStateSchema = z
  .object({
    module: z.string().describe("Clave del módulo (ModuleConfig.module)."),
    name: z.string(),
    enabled: z.boolean(),
  })
  .openapi({ ref: "ModuleState" });

export const CatalogHealthSchema = z
  .object({
    patientsIncomplete: CatalogPatientsIncompleteSchema,
    medicsWithoutPreferences: z.object({
      count: z.number().int(),
      items: z.array(CatalogMedicRefSchema).max(5).describe("Los primeros 5 por apellido."),
    }).describe("Médicos activos sin ningún horario de atención cargado."),
    healthInsurancesUnused90d: z.object({ count: z.number().int() }).describe("Obras sociales sin pacientes con turnos en los últimos 90 días."),
    specializationsWithoutColor: z.object({ count: z.number().int() }),
    hcCopiesPending: z.object({
      count: z.number().int().describe("Solicitudes de copia de HC en PENDING."),
      overdue: z.number().int().describe("De esas, las que superaron las 48 h (Ley 26.529 art. 14)."),
    }),
    modules: z.array(ModuleStateSchema).describe("Estado de los módulos del consultorio, por clave."),
  })
  .openapi({ ref: "CatalogHealth" });

export const TrendWeekPointSchema = z
  .object({
    weekStart: IsoDate.describe("Lunes de la semana."),
    label: z.string().describe('"11 Feb".'),
    count: z.number().int().describe("Turnos no cancelados de esa semana."),
  })
  .openapi({ ref: "TrendWeekPoint" });

export const TrendMonthPointSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/).openapi({ example: "2026-04" }),
    label: z.string().describe('"Abr 26".'),
    total: z.number().int().describe("Turnos del mes (todos los estados)."),
    cancelled: z.number().int(),
    absent: z.number().int(),
    noShowPct: z.number().describe("(absent + cancelled) / total × 100, 1 decimal; 0 si `total` es 0."),
  })
  .openapi({ ref: "TrendMonthPoint" });

export const TrendTopSpecialtySchema = z
  .object({
    id: z.string().nullable().describe('null = "Sin especialidad".'),
    name: z.string(),
    color: z.string().nullable(),
    count: z.number().int(),
  })
  .openapi({ ref: "TrendTopSpecialty" });

export const TrendTopInsuranceSchema = z
  .object({
    id: z.string().nullable().describe('null = "Sin obra social".'),
    name: z.string(),
    count: z.number().int(),
  })
  .openapi({ ref: "TrendTopInsurance" });

export const AdminTrendsSchema = z
  .object({
    shiftsByWeek: z.array(TrendWeekPointSchema).length(8).describe("Últimas 8 semanas (la actual incluida), ascendente."),
    cancellationByMonth: z.array(TrendMonthPointSchema).length(6).describe("Últimos 6 meses (el actual incluido), ascendente."),
    topSpecialties: z.array(TrendTopSpecialtySchema).max(5).describe("Turnos de los últimos 30 días por especialidad del profesional, top 5."),
    topHealthInsurances: z.array(TrendTopInsuranceSchema).max(5).describe("Turnos de los últimos 30 días por obra social del paciente, top 5."),
  })
  .openapi({ ref: "AdminTrends" });

export const RecentLoginItemSchema = z
  .object({
    userId: z.string().describe('"" si el evento no tiene usuario.'),
    name: z.string(),
    role: z.string().nullable(),
    loggedAt: IsoDateTime,
    ipAddress: z.string().nullable(),
  })
  .openapi({ ref: "RecentLoginItem" });

export const InactiveUserItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    lastLoginAt: IsoDateTime.nullable().describe("Último LOGIN_SUCCESS registrado; null si nunca se logueó."),
  })
  .openapi({ ref: "InactiveUserItem" });

export const UsersBreakdownSchema = z
  .object({
    activeByRole: z.object({
      medic: z.number().int(),
      secretary: z.number().int(),
      admin: z.number().int(),
      inactive: z.number().int().describe("Usuarios deshabilitados o borrados (soft delete)."),
    }).describe("Usuarios activos distintos por rol (uno con dos roles cuenta en ambos)."),
    recentLogins: z.array(RecentLoginItemSchema).max(5).describe("Últimos 5 LOGIN_SUCCESS."),
    inactiveUsers30d: z.object({
      count: z.number().int(),
      items: z.array(InactiveUserItemSchema).max(5),
    }).describe("Usuarios activos sin LOGIN_SUCCESS en los últimos 30 días."),
  })
  .openapi({ ref: "UsersBreakdown" });

export const AdminDashboardSchema = z
  .object({
    header: AdminHeaderSchema,
    stats: AdminStatsSchema,
    activityFeed: z.array(AuditEventSchema).max(20).describe("Últimos 20 eventos del audit log, más nuevos primero."),
    catalogHealth: CatalogHealthSchema,
    trends: AdminTrendsSchema,
    users: UsersBreakdownSchema,
  })
  .openapi({ ref: "AdminDashboard" });

// ─── /api/stats ──────────────────────────────────────────────────────────────

export const StatsByStatusSchema = z
  .object({
    PENDING: z.number().int(),
    CONFIRMED: z.number().int(),
    ABSENT: z.number().int(),
    FINISHED: z.number().int(),
    CANCELLED: z.number().int(),
  })
  .openapi({ ref: "StatsByStatus", description: "Turnos del período por estado (siempre las 5 claves)." });

export const StatsHealthInsuranceCountSchema = z
  .object({
    name: z.string().describe('Nombre de la obra social o "Sin obra social".'),
    count: z.number().int(),
  })
  .openapi({ ref: "StatsHealthInsuranceCount" });

export const StatsSchema = z
  .object({
    totalShifts: z.number().int().describe("Turnos del período filtrado (mes o año, y médico si se indicó)."),
    totalPatients: z.number().int().describe("Pacientes activos de TODO el consultorio (no aplica el filtro)."),
    byStatus: StatsByStatusSchema,
    byHealthInsurance: z.array(StatsHealthInsuranceCountSchema).describe("Turnos del período por obra social del paciente, de mayor a menor."),
    byMonth: z.array(z.number().int()).length(12).describe("Turnos por mes del AÑO completo (enero = índice 0), aunque se filtre por `month`."),
    year: z.number().int(),
  })
  .openapi({ ref: "Stats" });
