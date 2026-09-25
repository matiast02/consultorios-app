// DTO compartidos de administración y auditoría del registro OpenAPI:
// configuración del consultorio, horarios, solicitudes de contacto, módulos,
// alta de usuarios, audit log e integridad.
//
// La forma es la que DEVUELVEN las rutas (filas de Prisma + serializadores),
// no la de types/index.ts. `ClinicHoursDay` también lo usa la landing pública
// (GET /api/public/clinic-info devuelve las mismas filas).

import { z } from "zod";
import { IsoDateTime } from "../registry";
// Enums y DTO compartidos, definidos una sola vez: `AuditAction` / `AuditEvent` en
// schemas/audit.ts y `ReminderChannel` en recordatorios.
import { AuditActionSchema, AuditEventSchema } from "./audit";
import { ReminderChannelSchema } from "./reminders";

// ─── Configuración del consultorio ───────────────────────────────────────────

/** Fila `ClinicSettings` (singleton `id: "default"`) serializada por GET/PUT /api/admin/clinic-settings. */
export const ClinicSettingsSchema = z
  .object({
    id: z.string().describe('Siempre "default" (singleton).'),
    name: z.string().nullable(),
    tagline: z.string().nullable(),
    contactEmail: z.string().nullable(),
    whatsappPrimary: z.string().nullable().describe("Solo dígitos (E.164 sin `+`); se normaliza al guardar."),
    whatsappSecondary: z.string().nullable(),
    phoneDisplay: z.string().nullable(),
    prefillWhatsappMessage: z.string().nullable().describe("Saludo inicial del link de WhatsApp de la landing."),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    mapLat: z.number().nullable().describe("Decimal(9,6) serializado como número."),
    mapLng: z.number().nullable(),
    mapZoom: z.number().int().nullable(),
    showTeam: z.boolean(),
    showHours: z.boolean(),
    showMap: z.boolean(),
    showContactForm: z.boolean(),
    yearsOfService: z.number().int().nullable(),
    patientsServedDisplay: z.string().nullable(),
    remindersEnabled: z.boolean(),
    reminderHoursBefore: z.number().int().describe("Primer recordatorio: horas antes del turno."),
    reminderSecondHoursBefore: z.number().int().nullable().describe("Segundo recordatorio (más cercano al turno) o null."),
    reminderChannels: z.array(ReminderChannelSchema).describe("Parseado del JSON guardado; sin duplicados."),
    reminderTemplate: z
      .string()
      .nullable()
      .describe("Plantilla con {paciente} {fecha} {hora} {profesional} {consultorio} {direccion} {link}; null = texto por defecto."),
    onlineBookingEnabled: z.boolean(),
    onlineBookingMinAdvanceHours: z.number().int(),
    onlineBookingMaxDaysAhead: z.number().int(),
    onlineBookingNotes: z.string().nullable().describe("Aviso que ve el paciente en /reservar."),
    updatedAt: IsoDateTime,
    emailConfigured: z
      .boolean()
      .describe("Derivado del entorno (no se guarda): hay proveedor de email real; si es false los recordatorios por email no salen."),
  })
  .openapi({ ref: "ClinicSettings" });

/** Fila `ClinicHours`: un día de la semana del consultorio (Monday-start). */
export const ClinicHoursDaySchema = z
  .object({
    id: z.string(),
    dayOfWeek: z.number().int().min(0).max(6).describe("0 = lunes … 6 = domingo."),
    closed: z.boolean(),
    amOpen: z.string().nullable().describe('"HH:mm"; null si no atiende a la mañana o está cerrado.'),
    amClose: z.string().nullable(),
    pmOpen: z.string().nullable(),
    pmClose: z.string().nullable(),
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "ClinicHoursDay" });

// ─── Solicitudes de contacto (landing) ───────────────────────────────────────

export const ContactRequestStatusSchema = z.enum(["new", "read", "archived"]).openapi({ ref: "ContactRequestStatus" });

/** Fila completa de `ContactRequest` (incluye IP y user agent) con la especialidad elegida. */
export const ContactRequestSchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    healthInsurance: z.string().nullable().describe("Texto libre que escribió el visitante."),
    specializationId: z.string().nullable(),
    specialization: z.object({ id: z.string(), name: z.string() }).nullable(),
    preferredDay: z.string().nullable().describe("Lunes … Sábado, o null."),
    message: z.string().nullable(),
    status: ContactRequestStatusSchema,
    whatsappOpened: z.boolean().describe("Recepción ya abrió el chat de WhatsApp con el visitante."),
    privacyAccepted: z.boolean(),
    privacyAcceptedAt: IsoDateTime.nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: IsoDateTime,
    readAt: IsoDateTime.nullable().describe("Se setea al pasar a `read`."),
  })
  .openapi({ ref: "ContactRequest" });

// ─── Módulos ─────────────────────────────────────────────────────────────────

/** Fila `ModuleConfig`: habilitación global de un módulo (recetas, órdenes, etc.). */
export const ModuleConfigSchema = z
  .object({
    id: z.string(),
    module: z.string().describe('Clave del módulo (p. ej. "prescriptions", "lab_orders").'),
    name: z.string().describe("Nombre para mostrar."),
    enabled: z.boolean(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi({ ref: "ModuleConfig" });

/** Fila `UserModuleAccess`: acceso de un usuario a un módulo. */
export const UserModuleAccessSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    module: z.string(),
    enabled: z.boolean(),
    user: z.object({ id: z.string(), name: z.string(), email: z.string().email() }),
  })
  .openapi({ ref: "UserModuleAccess" });

// ─── Alta de usuarios ────────────────────────────────────────────────────────

export const CreatedUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    createdAt: IsoDateTime,
  })
  .openapi({ ref: "CreatedUser" });

/** Respuesta de POST /api/register (formato propio, sin envoltorio `success`). */
export const RegisterInviteSchema = z
  .object({
    sent: z.boolean(),
    provider: z.string().describe("`resend`, `smtp` o `console` (desarrollo)."),
    error: z.string().optional().describe("Motivo si no se pudo enviar."),
  })
  .openapi({ ref: "RegisterInvite" });

export const RegisterResponseSchema = z
  .object({
    message: z.string().openapi({ example: "Account created successfully" }),
    user: CreatedUserSchema,
    invite: RegisterInviteSchema.nullable().describe("Solo con `sendInvite: true`; null si no se pidió."),
  })
  .openapi({ ref: "RegisterResponse" });

/** Error de POST /api/register en validación/duplicado/servidor: `{ error }` sin `success`. */
export const RegisterErrorSchema = z
  .object({ error: z.string().describe("Mensaje (en inglés para validación, en español para duplicados).") })
  .openapi({ ref: "RegisterError" });

// ─── Auditoría ───────────────────────────────────────────────────────────────

/** Fila cruda de `AuditLog` con el usuario actor (GET /api/audit-logs). */
export const AuditLogSchema = z
  .object({
    id: z.string(),
    userId: z.string().nullable().describe("null = actor desconocido o acción pública (login fallido, reserva online, link del paciente)."),
    action: AuditActionSchema,
    resource: z.string().describe("patient, shift, evolution, clinical_record, user, …"),
    resourceId: z.string(),
    details: z.string().nullable().describe("JSON con contexto (nunca contenido clínico)."),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    hash: z.string().nullable().describe("Hash encadenado por (resource, resourceId); null en filas anteriores al encadenado."),
    prevHash: z.string().nullable(),
    createdAt: IsoDateTime,
    user: z.object({ id: z.string(), name: z.string(), email: z.string().email() }).nullable(),
  })
  .openapi({ ref: "AuditLog" });

/** GET /api/audit/recent: eventos mapeados (`AuditEvent`, compartido con el dashboard admin) + cursor. */
export const AuditRecentSchema = z
  .object({
    items: z.array(AuditEventSchema).describe("Más nuevos primero."),
    nextCursor: IsoDateTime.nullable().describe("`createdAt` del último ítem para pedir la página siguiente con `before`; null si no hay más."),
  })
  .openapi({ ref: "AuditRecent" });

// ─── Integridad ──────────────────────────────────────────────────────────────

export const IntegrityReportSchema = z
  .object({
    allValid: z.boolean().describe("Ninguna cadena rota (clínica ni de auditoría)."),
    clinical: z.object({
      chains: z.number().int().describe("Cadenas verificadas: una por (entityType, entityId) del ledger clínico."),
      valid: z.number().int(),
      broken: z.array(
        z.object({
          entityType: z.string().describe("evolution, clinical_record, prescription, study_order, meal_plan, attachment."),
          entityId: z.string(),
          brokenAtVersion: z.number().int().optional().describe("Primera versión inconsistente."),
        }),
      ),
    }),
    audit: z.object({
      chains: z.number().int().describe("Cadenas verificadas: una por (resource, resourceId), hasta 1000."),
      valid: z.number().int(),
      broken: z.array(
        z.object({
          resource: z.string(),
          resourceId: z.string(),
          brokenAtId: z.string().optional().describe("ID de la primera fila inconsistente."),
        }),
      ),
      capped: z.boolean().describe("true si había más de 1000 cadenas y solo se verificaron las primeras."),
    }),
  })
  .openapi({ ref: "IntegrityReport" });
