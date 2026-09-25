// Recordatorios de turnos desde el host (cron). Mismo ciclo que
// POST /api/cron/reminders, sin pasar por HTTP.
//
//   pnpm reminders:run               → plan + dispatch (envía los EMAIL vencidos)
//   pnpm reminders:run -- --plan-only → solo crea los recordatorios que faltan
//
// Ejemplo de crontab (cada 15 min):
//   */15 * * * * cd /app && pnpm reminders:run >> /var/log/recordatorios.log 2>&1
//
// Usa DATABASE_URL, AUTH_SECRET (links de confirmación), NEXTAUTH_URL (base del
// link) y la configuración de email (EMAIL_PROVIDER / RESEND_API_KEY / SMTP_*).

import { prisma } from "../lib/prisma";
import { planReminders, runReminderCycle } from "../lib/reminders/scheduler";

async function main() {
  const planOnly = process.argv.includes("--plan-only");
  const startedAt = new Date();
  const summary = planOnly ? await planReminders(startedAt) : await runReminderCycle(startedAt);

  console.log(
    `[recordatorios] ${startedAt.toISOString()} ${planOnly ? "(solo plan) " : ""}` +
      `planificados=${summary.planned} emails=${summary.sentEmail} ` +
      `whatsapp_manuales=${summary.manualPending} fallidos=${summary.failed} ` +
      `opt_out=${summary.skippedOptOut} sin_contacto=${summary.skippedNoContact}`,
  );
}

main()
  .catch((e) => {
    console.error("[recordatorios] Error:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
