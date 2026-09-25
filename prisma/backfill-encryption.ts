// One-time backfill: cifra en reposo los datos clínicos preexistentes que aún
// están en texto plano. Idempotente (omite lo ya cifrado) y NO modifica
// updatedAt (usa UPDATE crudo, que además evita el doble cifrado de la extensión).
//
// Uso: pnpm run db:backfill-encryption   (una vez por entorno, tras configurar HC_ENC_KEY)

import { prisma } from "../lib/prisma";
import { encryptField, isEncryptionConfigured } from "../lib/field-crypto";
import { ENCRYPTED_FIELDS } from "../lib/clinical-encryption";

// Tabla → columnas a cifrar: la misma lista que usa la extensión de Prisma
// (los nombres de tabla coinciden con los de modelo en este schema).
const TARGETS: Record<string, string[]> = ENCRYPTED_FIELDS;

async function main() {
  if (!isEncryptionConfigured()) {
    console.error("HC_ENC_KEY no está configurada. Abortando (no habría nada que cifrar).");
    process.exit(1);
  }

  let totalUpdated = 0;

  for (const [table, fields] of Object.entries(TARGETS)) {
    const cols = fields.map((f) => `\`${f}\``).join(", ");
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT \`id\`, ${cols} FROM \`${table}\``
    )) as Array<Record<string, unknown>>;

    let updated = 0;
    for (const row of rows) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const f of fields) {
        const v = row[f];
        if (typeof v === "string" && v.length > 0 && !v.startsWith("enc:")) {
          sets.push(`\`${f}\` = ?`);
          vals.push(encryptField(v));
        }
      }
      if (sets.length > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE \`${table}\` SET ${sets.join(", ")} WHERE \`id\` = ?`,
          ...vals,
          row.id
        );
        updated++;
      }
    }
    console.log(`${table}: ${updated} filas cifradas (de ${rows.length}).`);
    totalUpdated += updated;
  }

  console.log(`Backfill de cifrado completo: ${totalUpdated} filas actualizadas.`);
}

main()
  .catch((e) => {
    console.error("Backfill de cifrado error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
