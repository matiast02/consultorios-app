// Migración one-shot del sistema viejo (Express + Sequelize) al nuevo.
// Pensado para el pase a PRODUCCIÓN sobre una base vacía:
//   1. Siembra los datos base (roles, profesiones, tipos de consulta, módulos
//      y admin inicial vía ADMIN_EMAIL/ADMIN_PASSWORD) con seedBase().
//   2. Importa el dump SQL del sistema viejo:
//        os              → HealthInsurance
//        users           → User (+UserRole, +Specialization); el hash bcrypt legacy
//                          se guarda en Account (providerId "credential") — Better Auth
//        userpreferences → UserPreference (día 1-7 → 0-6, "24:00" → null)
//        patients        → Patient (DNI duplicados se resuelven, ver reporte)
//        shifts          → Shift (state 1/2/3/4 → PENDING/CONFIRMED/ABSENT/FINISHED)
//   3. Las observaciones clínicas de turnos finalizados se convierten en
//      Evolution (cifradas AES-256-GCM vía la extensión de Prisma); las notas
//      administrativas cortas quedan como observación del turno.
//   4. Al final corre el backfill del ledger de inalterabilidad.
//
// Las fechas del dump están en hora local argentina → se convierten con -03:00.
//
// Uso:
//   pnpm db:migrate-legacy -- --dump C:/ruta/consultorios.sql [--dry-run] [--force]
//                             [--report salida.json] [--skip-ledger] [--allow-unencrypted]
//
//   --dry-run           Parsea y reporta sin escribir nada.
//   --force             Permite correr aunque la base ya tenga pacientes/turnos.
//   --skip-ledger       No corre el backfill del ledger al final.
//   --allow-unencrypted Permite correr sin HC_ENC_KEY (NO usar en producción).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { isEncryptionConfigured } from "../lib/field-crypto";
import { seedBase } from "./seed-base";
import { setUserPassword } from "../lib/credentials";
import {
  parseDump,
  legacyDateToUtc,
  emptyToNull,
  type LegacyRow,
} from "./legacy-dump-parser";

// ─── CLI args ────────────────────────────────────────────────────────────────

interface Args {
  dump: string;
  dryRun: boolean;
  force: boolean;
  skipLedger: boolean;
  allowUnencrypted: boolean;
  report: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };
  const dump = get("--dump");
  if (!dump) {
    console.error("Falta --dump <ruta al .sql del sistema viejo>");
    process.exit(1);
  }
  return {
    dump,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    skipLedger: argv.includes("--skip-ledger"),
    allowUnencrypted: argv.includes("--allow-unencrypted"),
    report: get("--report") ?? "migration-report.json",
  };
}

// ─── Mapeos ──────────────────────────────────────────────────────────────────

const STATE_MAP: Record<number, "PENDING" | "CONFIRMED" | "ABSENT" | "FINISHED"> = {
  1: "PENDING", // pendiente
  2: "CONFIRMED", // en proceso
  3: "ABSENT", // ausente
  4: "FINISHED", // finalizado
};

const LEGACY_ROLE_MAP: Record<number, string | null> = {
  1: "admin",
  2: "secretary",
  3: "medic",
  4: null, // guest — sin equivalente
};

// Emails inválidos del sistema viejo → corrección
const EMAIL_FIXES: Record<string, string> = {
  admin: "admin@consultorio.com",
};

// Heurística: una observación de turno finalizado es una evolución clínica si
// es larga o contiene marcadores típicos de las notas médicas del sistema viejo.
const CLINICAL_RE = /\b(AP|CX|MC|EF|FUM|RS|IOE|IOU|SVI)\s*:/;

function isClinicalNote(state: number | null, obs: string | null): boolean {
  if (state !== 4 || !obs) return false;
  return obs.length >= 200 || CLINICAL_RE.test(obs);
}

const newId = () => crypto.randomUUID();

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log("🔄 Migración legacy → nuevo sistema\n");
  console.log(`   Dump:    ${args.dump}`);
  console.log(`   Modo:    ${args.dryRun ? "DRY-RUN (sin escrituras)" : "REAL"}\n`);

  if (!args.dryRun && !isEncryptionConfigured() && !args.allowUnencrypted) {
    console.error(
      "❌ HC_ENC_KEY no está configurada: las evoluciones quedarían SIN cifrar.\n" +
        "   Configurala (base64 de 32 bytes) o usá --allow-unencrypted bajo tu responsabilidad.",
    );
    process.exit(1);
  }

  // ── Parseo del dump ────────────────────────────────────────────────────────
  const sql = readFileSync(args.dump, "utf8");
  const tables = parseDump(sql);
  const legacyOs = tables.get("os") ?? [];
  const legacyUsers = tables.get("users") ?? [];
  const legacyUserRoles = tables.get("user_roles") ?? [];
  const legacyPrefs = tables.get("userpreferences") ?? [];
  const legacyPatients = tables.get("patients") ?? [];
  const legacyShifts = tables.get("shifts") ?? [];

  console.log("📦 Dump parseado:");
  console.log(`   os: ${legacyOs.length} · users: ${legacyUsers.length} · prefs: ${legacyPrefs.length}`);
  console.log(`   patients: ${legacyPatients.length} · shifts: ${legacyShifts.length}\n`);

  // ── Guard: la base destino debe estar vacía ────────────────────────────────
  if (!args.dryRun) {
    const [nPatients, nShifts] = await Promise.all([
      prisma.patient.count(),
      prisma.shift.count(),
    ]);
    if ((nPatients > 0 || nShifts > 0) && !args.force) {
      console.error(
        `❌ La base destino ya tiene datos (${nPatients} pacientes, ${nShifts} turnos).\n` +
          "   Esta migración está pensada para una base vacía. Usá --force para insistir.",
      );
      process.exit(1);
    }
  }

  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    dump: args.dump,
    dryRun: args.dryRun,
  };
  const anomalies: string[] = [];

  // ── Resolución de DNI duplicados (el nuevo schema tiene @unique) ──────────
  // Se queda con el DNI el mejor candidato: primero los no borrados, después
  // el actualizado más recientemente. El resto pierde el DNI (queda null).
  const dniGroups = new Map<string, LegacyRow[]>();
  for (const p of legacyPatients) {
    const dni = emptyToNull(p.dni);
    if (!dni) continue;
    const g = dniGroups.get(dni) ?? [];
    g.push(p);
    dniGroups.set(dni, g);
  }
  const dniLosers = new Set<number>(); // legacy patient ids que pierden su dni
  for (const [dni, group] of dniGroups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const aDeleted = a.deletedAt != null ? 1 : 0;
      const bDeleted = b.deletedAt != null ? 1 : 0;
      if (aDeleted !== bDeleted) return aDeleted - bDeleted;
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    for (const loser of sorted.slice(1)) dniLosers.add(loser.id as number);
    anomalies.push(
      `DNI ${dni} duplicado en pacientes legacy [${group.map((g) => g.id).join(", ")}] — lo conserva #${sorted[0].id}`,
    );
  }

  // ── Clasificación de turnos ────────────────────────────────────────────────
  let clinicalCount = 0;
  let shortNoteCount = 0;
  for (const s of legacyShifts) {
    const obs = emptyToNull(s.observations);
    if (!obs) continue;
    if (isClinicalNote(s.state as number | null, obs)) clinicalCount++;
    else shortNoteCount++;
  }

  console.log("🔍 Análisis previo:");
  console.log(`   DNIs duplicados resueltos: ${dniLosers.size} pacientes pierden DNI (${[...dniGroups.values()].filter((g) => g.length > 1).length} grupos)`);
  console.log(`   Observaciones clínicas → Evolution: ${clinicalCount}`);
  console.log(`   Notas administrativas que quedan en el turno: ${shortNoteCount}\n`);

  report.analysis = {
    dniConflictGroups: [...dniGroups.values()].filter((g) => g.length > 1).length,
    patientsLosingDni: dniLosers.size,
    clinicalEvolutions: clinicalCount,
    adminNotes: shortNoteCount,
  };

  if (args.dryRun) {
    report.finishedAt = new Date().toISOString();
    report.anomalies = anomalies;
    writeFileSync(args.report, JSON.stringify(report, null, 2));
    console.log(`✅ Dry-run completo. Reporte: ${args.report}`);
    return;
  }

  // ── 1. Seed base (roles, profesiones, tipos de consulta, módulos, admin) ──
  console.log("🌱 Sembrando datos base…");
  await seedBase(prisma as unknown as PrismaClient);

  const roleIdByName = new Map<string, string>();
  for (const r of await prisma.role.findMany()) roleIdByName.set(r.name, r.id);

  // ── 2. Obras sociales ──────────────────────────────────────────────────────
  console.log("\n🏥 Migrando obras sociales…");
  const osIdMap = new Map<number, string>();
  {
    const rows = legacyOs.map((o) => ({
      id: newId(),
      name: String(o.name ?? "").trim() || `OS legacy #${o.id}`,
      code: o.code != null ? String(o.code) : null,
      createdAt: legacyDateToUtc(o.createdAt) ?? new Date(),
      updatedAt: legacyDateToUtc(o.updatedAt) ?? new Date(),
    }));
    legacyOs.forEach((o, i) => osIdMap.set(o.id as number, rows[i].id));
    for (const batch of chunk(rows, 200)) {
      await prisma.healthInsurance.createMany({ data: batch });
    }
    console.log(`   ${rows.length} obras sociales`);
  }

  // ── 3. Usuarios + especializaciones + roles ────────────────────────────────
  console.log("\n👥 Migrando usuarios…");
  const userIdMap = new Map<number, string>();
  const userEmailFixes: Record<string, string> = {};
  {
    // Especializaciones reales (excluye vacío y "administrador")
    const specNames = new Set<string>();
    for (const u of legacyUsers) {
      const s = emptyToNull(u.specialization);
      if (s && s.toLowerCase() !== "administrador") specNames.add(s);
    }
    const specIdByName = new Map<string, string>();
    for (const name of specNames) {
      const spec = await prisma.specialization.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      specIdByName.set(name, spec.id);
    }

    const legacyRoleNames = new Map<number, string>(); // legacy role id → nombre nuevo
    for (const [k, v] of Object.entries(LEGACY_ROLE_MAP)) {
      if (v) legacyRoleNames.set(Number(k), v);
    }

    for (const u of legacyUsers) {
      let email = emptyToNull(u.email) ?? `user${u.id}@consultorio.legacy`;
      if (EMAIL_FIXES[email]) {
        userEmailFixes[email] = EMAIL_FIXES[email];
        email = EMAIL_FIXES[email];
      }

      const roleRow = legacyUserRoles.find((r) => r.userId === u.id);
      const roleName = roleRow ? legacyRoleNames.get(roleRow.roleId as number) ?? null : null;
      const specName = emptyToNull(u.specialization);
      const isMedicUser = roleName === "medic";

      // Si seedBase ya creó este email (p.ej. el admin), reutilizar el usuario.
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        userIdMap.set(u.id as number, existing.id);
        anomalies.push(`Usuario legacy #${u.id} (${email}) ya existía — se reutiliza`);
        continue;
      }

      const created = await prisma.user.create({
        data: {
          email,
          firstName: emptyToNull(u.firstName),
          lastName: emptyToNull(u.lastName),
          name: [emptyToNull(u.firstName), emptyToNull(u.lastName)].filter(Boolean).join(" ") || email,
          // El sistema viejo trabajaba con turnos de 15 minutos
          slotDurationMinutes: isMedicUser ? 15 : 30,
          specializationId:
            isMedicUser && specName && specName.toLowerCase() !== "administrador"
              ? specIdByName.get(specName) ?? null
              : null,
          createdAt: legacyDateToUtc(u.createdAt) ?? new Date(),
          deletedAt: legacyDateToUtc(u.deletedAt),
        },
      });
      userIdMap.set(u.id as number, created.id);

      // Hash bcrypt del sistema viejo ($2a$…): bcryptjs lo verifica tal cual.
      await setUserPassword(prisma, created.id, { hash: String(u.password) });

      if (roleName && roleIdByName.has(roleName)) {
        await prisma.userRole.create({
          data: { userId: created.id, roleId: roleIdByName.get(roleName)! },
        });
      } else if (roleRow) {
        anomalies.push(`Usuario legacy #${u.id}: rol legacy ${roleRow.roleId} sin equivalente — sin rol asignado`);
      }
    }
    console.log(`   ${userIdMap.size} usuarios (contraseñas preservadas)`);
  }

  // ── 4. Preferencias horarias ───────────────────────────────────────────────
  console.log("\n🕐 Migrando preferencias horarias…");
  {
    // Día viejo: 1=Lunes … 7=Domingo → nuevo: 0=Domingo … 6=Sábado
    const hour = (v: unknown): string | null => {
      const s = emptyToNull(v as string | null);
      return s === "24:00" ? null : s;
    };
    let count = 0;
    const seen = new Set<string>();
    for (const p of legacyPrefs) {
      const userId = userIdMap.get(p.userId as number);
      if (!userId) continue;
      const day = (p.day as number) % 7;
      const key = `${userId}:${day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await prisma.userPreference.create({
        data: {
          userId,
          day,
          fromHourAM: hour(p.fromHourAM),
          toHourAM: hour(p.toHourAM),
          fromHourPM: hour(p.fromHourPM),
          toHourPM: hour(p.toHourPM),
        },
      });
      count++;
    }
    console.log(`   ${count} preferencias`);
  }

  // ── 5. Pacientes ───────────────────────────────────────────────────────────
  console.log("\n🧑‍🤝‍🧑 Migrando pacientes…");
  const patientIdMap = new Map<number, string>();
  {
    const rows = legacyPatients.map((p) => {
      const id = newId();
      patientIdMap.set(p.id as number, id);
      return {
        id,
        firstName: emptyToNull(p.firstName) ?? "(sin nombre)",
        lastName: emptyToNull(p.lastName) ?? "(sin apellido)",
        birthDate: legacyDateToUtc(p.birthDate),
        dni: dniLosers.has(p.id as number) ? null : emptyToNull(p.dni),
        email: emptyToNull(p.email),
        telephone: emptyToNull(p.telephone),
        address: emptyToNull(p.address),
        country: emptyToNull(p.country),
        province: emptyToNull(p.province),
        osId: p.osId != null ? osIdMap.get(p.osId as number) ?? null : null,
        osNumber: emptyToNull(p.osNumber),
        createdAt: legacyDateToUtc(p.createdAt) ?? new Date(),
        updatedAt: legacyDateToUtc(p.updatedAt) ?? new Date(),
        deletedAt: legacyDateToUtc(p.deletedAt),
      };
    });
    for (const batch of chunk(rows, 200)) {
      await prisma.patient.createMany({ data: batch });
    }
    console.log(`   ${rows.length} pacientes (${dniLosers.size} sin DNI por duplicado)`);
  }

  // ── 6. Turnos + evoluciones clínicas ───────────────────────────────────────
  console.log("\n📅 Migrando turnos y evoluciones…");
  {
    type ShiftRow = Prisma.ShiftCreateManyInput & { id: string };
    const shiftRows: ShiftRow[] = [];
    const evolutionSeeds: Array<{
      shiftId: string;
      legacyPatientId: number;
      userId: string;
      notes: string;
      createdAt: Date;
    }> = [];
    let skipped = 0;

    for (const s of legacyShifts) {
      const userId = userIdMap.get(s.userId as number);
      const patientId = patientIdMap.get(s.patientId as number);
      const start = legacyDateToUtc(s.start);
      const end = legacyDateToUtc(s.end);
      if (!userId || !patientId || !start || !end) {
        skipped++;
        anomalies.push(`Turno legacy #${s.id} omitido (referencia o fecha inválida)`);
        continue;
      }

      const obs = emptyToNull(s.observations);
      const state = (s.state as number | null) ?? 1;
      const clinical = isClinicalNote(state, obs);
      const id = newId();

      shiftRows.push({
        id,
        userId,
        patientId,
        start,
        end,
        status: STATE_MAP[state] ?? "PENDING",
        observations: clinical ? null : obs,
        createdAt: legacyDateToUtc(s.createdAt) ?? start,
        updatedAt: legacyDateToUtc(s.updatedAt) ?? start,
      });

      if (clinical && obs) {
        evolutionSeeds.push({
          shiftId: id,
          legacyPatientId: s.patientId as number,
          userId,
          notes: obs,
          createdAt: legacyDateToUtc(s.updatedAt) ?? end,
        });
      }
    }

    for (const batch of chunk(shiftRows, 200)) {
      await prisma.shift.createMany({ data: batch });
    }
    console.log(`   ${shiftRows.length} turnos (${skipped} omitidos)`);

    // Historia clínica por paciente con evoluciones
    const recordIdByLegacyPatient = new Map<number, string>();
    const patientsWithClinical = [...new Set(evolutionSeeds.map((e) => e.legacyPatientId))];
    const recordRows = patientsWithClinical.map((lpid) => {
      const id = newId();
      recordIdByLegacyPatient.set(lpid, id);
      return { id, patientId: patientIdMap.get(lpid)! };
    });
    for (const batch of chunk(recordRows, 500)) {
      await prisma.clinicalRecord.createMany({ data: batch });
    }

    // Evoluciones — pasan por la extensión de cifrado (createMany cifra "notes")
    const evolutionRows = evolutionSeeds.map((e) => ({
      id: newId(),
      clinicalRecordId: recordIdByLegacyPatient.get(e.legacyPatientId)!,
      shiftId: e.shiftId,
      userId: e.userId,
      notes: e.notes,
      createdAt: e.createdAt,
      updatedAt: e.createdAt,
    }));
    for (const batch of chunk(evolutionRows, 100)) {
      await prisma.evolution.createMany({ data: batch });
    }
    console.log(`   ${recordRows.length} historias clínicas · ${evolutionRows.length} evoluciones cifradas`);

    report.migrated = {
      healthInsurances: legacyOs.length,
      users: userIdMap.size,
      patients: patientIdMap.size,
      shifts: shiftRows.length,
      shiftsSkipped: skipped,
      clinicalRecords: recordRows.length,
      evolutions: evolutionRows.length,
      userEmailFixes,
    };
  }

  // ── 7. Ledger de inalterabilidad ───────────────────────────────────────────
  if (!args.skipLedger) {
    console.log("\n🔏 Corriendo backfill del ledger de inalterabilidad…");
    const res = spawnSync("npx", ["tsx", "prisma/backfill-ledger.ts"], {
      stdio: "inherit",
      shell: true,
    });
    if (res.status !== 0) {
      anomalies.push("Backfill del ledger terminó con error — correr manualmente: pnpm db:backfill-ledger");
    }
  } else {
    console.log("\n⚠️ Ledger omitido (--skip-ledger). Correr después: pnpm db:backfill-ledger");
  }

  report.finishedAt = new Date().toISOString();
  report.anomalies = anomalies;
  writeFileSync(args.report, JSON.stringify(report, null, 2));

  console.log(`\n✅ Migración completa. Reporte: ${args.report}`);
  if (anomalies.length > 0) {
    console.log(`   ⚠️ ${anomalies.length} anomalías registradas en el reporte.`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
