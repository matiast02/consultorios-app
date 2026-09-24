// Genera las miniaturas que falten en adjuntos de imagen: subidos antes de la
// función, cuya generación falló al subir, o restaurados de un backup sin los
// archivos .thumb.hca. Idempotente: salta los que ya tienen miniatura y los PDF.
// Requiere HC_ENC_KEY (descifra el original) y acceso a ATTACHMENTS_DIR.
//
// Uso: pnpm db:backfill-thumbnails [--dry-run]

import { prisma } from "../lib/prisma";
import { isEncryptionConfigured } from "../lib/field-crypto";
import { generateMissingThumbnail } from "../lib/attachments/service";
import { THUMBNAILABLE_MIME } from "../lib/attachments/thumbnail";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!isEncryptionConfigured()) {
    console.error("HC_ENC_KEY no está configurada. Abortando (no se pueden descifrar los originales).");
    process.exit(1);
  }

  const rows = await prisma.clinicalAttachment.findMany({
    where: { thumbnailKey: null, mimeType: { in: [...THUMBNAILABLE_MIME] } },
    select: { id: true, patientId: true, mimeType: true, storageKey: true, wrappedDek: true, thumbnailKey: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${rows.length} adjuntos de imagen sin miniatura.`);
  if (dryRun || rows.length === 0) return;

  let generated = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      if (await generateMissingThumbnail(row)) generated++;
      else skipped++;
    } catch (e) {
      skipped++;
      console.error(`  ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(
    `Miniaturas generadas: ${generated}. Sin miniatura (imagen ilegible o archivo faltante): ${skipped}.`,
  );
}

main()
  .catch((e) => {
    console.error("Backfill de miniaturas error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
