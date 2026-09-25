// DTO compartidos de los catálogos del registro OpenAPI: obras sociales,
// especialidades, tipos de consulta y configuraciones de profesión. Los
// medicamentos están en schemas/clinical.ts.
//
// La forma es la que DEVUELVEN las rutas (findMany/findUnique de Prisma con sus
// include), no la de types/index.ts. Se arman a partir de objetos de campos
// (sin `.extend()`) para que el cliente generado no reciba `allOf`.

import { z } from "zod";
import { IsoDateTime } from "../registry";

// ─── Obras sociales ──────────────────────────────────────────────────────────

const healthInsuranceFields = {
  id: z.string(),
  name: z.string().describe("No es único en la base: puede haber dos obras sociales con el mismo nombre."),
  code: z.string().nullable().describe("Código corto (hasta 20 caracteres)."),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
};

export const HealthInsuranceSchema = z.object(healthInsuranceFields).openapi({ ref: "HealthInsurance" });

export const HealthInsurancePatientRefSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    dni: z.string().nullable(),
  })
  .openapi({ ref: "HealthInsurancePatientRef" });

/** `GET /api/health-insurance/{id}`: la obra social con sus pacientes activos. */
export const HealthInsuranceDetailSchema = z
  .object({
    ...healthInsuranceFields,
    patients: z
      .array(HealthInsurancePatientRefSchema)
      .describe("Pacientes no archivados que la tienen como obra social principal (`osId`). No incluye las secundarias (`PatientInsurance`)."),
  })
  .openapi({ ref: "HealthInsuranceDetail" });

// ─── Configuraciones de profesión ────────────────────────────────────────────

const professionConfigFields = {
  id: z.string(),
  code: z.string().describe('Único: "medic", "psychologist", "dentist", …'),
  name: z.string().describe('"Médico", "Psicólogo", "Dentista", …'),
  professionalLabel: z.string().describe('Tratamiento del profesional: "Dr/a.", "Lic.", "Od.".'),
  patientLabel: z.string().describe('Cómo se llama al paciente en la UI ("Paciente" por defecto).'),
  prescriptionLabel: z.string().describe('"Receta", "Indicación", "Plan de tratamiento", …'),
  evolutionLabel: z.string().describe('"Evolución", "Nota de sesión", "Registro odontológico", …'),
  clinicalRecordLabel: z.string().describe('"Historia Clínica", "Ficha Psicológica", "Ficha Dental", …'),
  enabledModules: z.string().describe('JSON de `string[]` con los módulos habilitados (p. ej. `["prescriptions","study_orders"]`).'),
  clinicalFields: z.string().describe("JSON con los campos propios de la ficha clínica de la profesión."),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
};

export const ProfessionConfigSchema = z
  .object({
    ...professionConfigFields,
    _count: z
      .object({ specializations: z.number().int() })
      .optional()
      .describe("Solo en `GET /api/profession-configs`; ausente cuando viene anidada en una especialidad."),
  })
  .openapi({ ref: "ProfessionConfig" });

// ─── Especialidades ──────────────────────────────────────────────────────────

const specializationFields = {
  id: z.string(),
  name: z.string().describe("Único."),
  color: z.string().nullable().describe('Hex "#RRGGBB" del punto del profesional en la agenda; null si no tiene.'),
  professionConfigId: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
};

export const SpecializationSchema = z
  .object({
    ...specializationFields,
    professionConfig: ProfessionConfigSchema.nullable().describe("Configuración de profesión asociada (etiquetas y módulos); null si no tiene."),
    _count: z.object({ users: z.number().int().describe("Profesionales con esta especialidad.") }),
  })
  .openapi({ ref: "Specialization" });

/** Especialidad dentro de `GET /api/profession-configs/{id}` (sin `professionConfig`, que es el padre). */
export const ProfessionConfigSpecializationSchema = z
  .object({
    ...specializationFields,
    _count: z.object({ users: z.number().int() }),
  })
  .openapi({ ref: "ProfessionConfigSpecialization" });

export const ProfessionConfigDetailSchema = z
  .object({
    ...professionConfigFields,
    specializations: z.array(ProfessionConfigSpecializationSchema).describe("Ordenadas por nombre."),
  })
  .openapi({ ref: "ProfessionConfigDetail" });

// ─── Tipos de consulta ───────────────────────────────────────────────────────

export const ConsultationTypeSchema = z
  .object({
    id: z.string(),
    name: z.string().describe("Único."),
    durationMinutes: z.number().int().describe("Duración en minutos (5 a 120)."),
    color: z.string().nullable(),
    isDefault: z.boolean().describe("A lo sumo uno es el default: marcar otro desmarca el anterior."),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    _count: z
      .object({ shifts: z.number().int().describe("Turnos que lo usan.") })
      .optional()
      .describe("Presente en las rutas de catálogo; ausente cuando viene anidado en un turno."),
  })
  .openapi({ ref: "ConsultationType" });
