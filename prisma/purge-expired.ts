// Purga de datos técnicos vencidos (Ley 25.326 art. 4: no conservar más de lo
// necesario). Idempotente; pensado para correr por cron (p.ej. diario).
//
//   pnpm db:purge-expired            → borra
//   pnpm db:purge-expired -- --dry-run → solo informa
//
// NO toca AuditLog ni ClinicalEntryVersion: el registro de accesos a datos de
// salud y el ledger de la HC se conservan (mínimo 10 años, Ley 26.529 art. 18).

import { prisma } from "../lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();

  const targets: Array<{ label: string; count: () => Promise<number>; purge: () => Promise<number> }> = [
    {
      label: "Sesiones vencidas",
      count: () => prisma.session.count({ where: { expiresAt: { lt: now } } }),
      purge: () => prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }).then((r) => r.count),
    },
    {
      label: "Verificaciones vencidas (Better Auth)",
      count: () => prisma.verification.count({ where: { expiresAt: { lt: now } } }),
      purge: () => prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }).then((r) => r.count),
    },
    {
      label: "Tokens de reset vencidos o usados hace > 1 día",
      count: () =>
        prisma.resetToken.count({
          where: { OR: [{ expires: { lt: now } }, { used: true, createdAt: { lt: new Date(now.getTime() - DAY_MS) } }] },
        }),
      purge: () =>
        prisma.resetToken
          .deleteMany({
            where: { OR: [{ expires: { lt: now } }, { used: true, createdAt: { lt: new Date(now.getTime() - DAY_MS) } }] },
          })
          .then((r) => r.count),
    },
    {
      label: "Rate limits vencidos (login y endpoints propios)",
      count: () => prisma.rateLimit.count({ where: { expiresAt: { lt: now } } }),
      purge: () => prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }).then((r) => r.count),
    },
    {
      label: "Notificaciones leídas hace > 90 días",
      count: () =>
        prisma.notification.count({ where: { read: true, createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } } }),
      purge: () =>
        prisma.notification
          .deleteMany({ where: { read: true, createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } } })
          .then((r) => r.count),
    },
  ];

  console.log(`🧹 Purga de datos vencidos ${dryRun ? "(DRY-RUN)" : ""}\n`);
  let total = 0;
  for (const t of targets) {
    const n = dryRun ? await t.count() : await t.purge();
    total += n;
    console.log(`   ${t.label.padEnd(52)} ${String(n).padStart(6)}`);
  }
  console.log(`\n${dryRun ? "Se borrarían" : "Borrados"}: ${total} registros.`);
}

main()
  .catch((e) => {
    console.error("❌ Error en la purga:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
