// Extensión de Prisma: cifra/descifra por columna los campos clínicos sensibles.
// - Escritura: cifra sólo los campos listados de cada modelo (deja en claro DNI,
//   nombres, fechas, etc. para búsqueda/agenda).
// - Lectura: descifra recursivamente (maneja relaciones incluidas). Es seguro
//   aplicarlo a cualquier string porque decryptField sólo transforma tokens "enc:".

import { Prisma } from "@prisma/client";
import { encryptField, decryptField } from "./field-crypto";

// Campos cifrados por modelo (nombres de modelo Prisma en PascalCase).
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  ClinicalRecord: [
    "allergies",
    "personalHistory",
    "familyHistory",
    "currentMedication",
    "notes",
    "structuredAllergies",
    "habitsTobacco",
    "habitsAlcohol",
    "habitsActivity",
    "habitsDiet",
    "odontogram",
    "genogram",
  ],
  Evolution: ["reason", "physicalExam", "diagnosis", "treatment", "indications", "notes"],
  Prescription: ["items", "diagnosis", "notes"],
  StudyOrder: ["items", "resultNotes"],
  MealPlan: ["meals", "avoidFoods", "supplements", "notes", "hydration"],
  ClinicalEntryVersion: ["data"],
};

function encryptInto(data: unknown, fields: string[]): void {
  if (!data || typeof data !== "object") return;
  const obj = data as Record<string, unknown>;
  for (const f of fields) {
    if (!(f in obj)) continue;
    const v = obj[f];
    if (v == null) continue;
    if (typeof v === "string") {
      obj[f] = encryptField(v);
    } else if (typeof v === "object" && typeof (v as { set?: unknown }).set === "string") {
      // Prisma update shape: { set: value }
      obj[f] = { set: encryptField((v as { set: string }).set) };
    }
  }
}

// Descifra recursivamente cualquier string "enc:" en el resultado (in place).
function decryptDeep(value: unknown): unknown {
  if (typeof value === "string") return decryptField(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = decryptDeep(value[i]);
    return value;
  }
  // Sólo objetos planos (evita Date, Decimal, Buffer, etc.).
  if (value && typeof value === "object" && (value.constructor === Object || value.constructor === undefined)) {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) obj[k] = decryptDeep(obj[k]);
    return obj;
  }
  return value;
}

export const clinicalEncryptionExtension = Prisma.defineExtension({
  name: "clinical-encryption",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const fields = ENCRYPTED_FIELDS[model];
        if (fields && args && typeof args === "object") {
          const a = args as Record<string, unknown>;
          if (operation === "create" || operation === "update") {
            encryptInto(a.data, fields);
          } else if (operation === "upsert") {
            encryptInto(a.create, fields);
            encryptInto(a.update, fields);
          } else if (operation === "createMany") {
            const d = a.data;
            if (Array.isArray(d)) d.forEach((x) => encryptInto(x, fields));
            else encryptInto(d, fields);
          } else if (operation === "updateMany") {
            encryptInto(a.data, fields);
          }
        }
        const result = await query(args);
        return decryptDeep(result);
      },
    },
  },
});
