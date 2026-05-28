// Manual smoke test for the patient search helper against the live DB.
// Run with: pnpm exec tsx scripts/test-patient-search.ts
//
// This is NOT a CI test — it requires Docker MySQL to be up and seeded.

import { PrismaClient } from "@prisma/client";
import { buildPatientSearchWhere, normalizeDni, normalizeSearch } from "../lib/search";

const prisma = new PrismaClient();

type Case = { label: string; query: string; expectMatchLastName: string };

const CASES: Case[] = [
  // Accent + case (DB handles via utf8mb4_unicode_ci, helper just trims)
  { label: "lowercase no-accent",   query: "alvarez",       expectMatchLastName: "Álvarez" },
  { label: "uppercase no-accent",   query: "PEREZ",         expectMatchLastName: "Pérez" },
  { label: "with accent",           query: "Álvarez",       expectMatchLastName: "Álvarez" },
  { label: "substring",             query: "fer",           expectMatchLastName: "Fernández" },

  // DNI with separators (helper feature)
  { label: "DNI with dots",         query: "28.456.789",    expectMatchLastName: "Pérez" },
  { label: "DNI with hyphens",      query: "28-456-789",    expectMatchLastName: "Pérez" },
  { label: "DNI with spaces",       query: "28 456 789",    expectMatchLastName: "Pérez" },
  { label: "DNI raw digits",        query: "28456789",      expectMatchLastName: "Pérez" },

  // Multi-token (helper feature)
  { label: "first + last",          query: "Pedro Alvarez", expectMatchLastName: "Álvarez" },
  { label: "last + first reversed", query: "Alvarez Pedro", expectMatchLastName: "Álvarez" },
  { label: "partials both ways",    query: "ped alv",       expectMatchLastName: "Álvarez" },

  // Whitespace/garbage
  { label: "trailing spaces",       query: "  alvarez  ",   expectMatchLastName: "Álvarez" },
  { label: "non-breaking space",    query: "Pedro Alvarez", expectMatchLastName: "Álvarez" },
  { label: "double spaces",         query: "Pedro    Alvarez", expectMatchLastName: "Álvarez" },
];

async function main() {
  console.log("─── Unit checks (pure helpers) ───");
  console.log("normalizeDni('28.456.789') =", JSON.stringify(normalizeDni("28.456.789")));
  console.log("normalizeDni('28-456-789') =", JSON.stringify(normalizeDni("28-456-789")));
  console.log("normalizeSearch('  Pedro\\u00A0Alvarez  ') =", JSON.stringify(normalizeSearch("  Pedro Alvarez  ")));
  console.log();

  console.log("─── DB integration (per-query) ───");
  let pass = 0;
  let fail = 0;
  for (const c of CASES) {
    const where = buildPatientSearchWhere(c.query);
    if (!where) {
      console.log(`❌ ${c.label.padEnd(28)} | empty where for "${c.query}"`);
      fail++;
      continue;
    }
    const rows = await prisma.patient.findMany({
      where: { ...where, deletedAt: null },
      select: { firstName: true, lastName: true, dni: true },
    });
    const ok = rows.some((r) => r.lastName === c.expectMatchLastName);
    if (ok) {
      console.log(
        `✅ ${c.label.padEnd(28)} | "${c.query}" → ${rows.length} row(s)`,
      );
      pass++;
    } else {
      console.log(
        `❌ ${c.label.padEnd(28)} | "${c.query}" → ${rows.length} row(s), expected ${c.expectMatchLastName}`,
      );
      console.log("   where:", JSON.stringify(where));
      console.log("   got  :", rows.map((r) => `${r.lastName}, ${r.firstName} (${r.dni})`).join(" / "));
      fail++;
    }
  }

  console.log();
  console.log(`Summary: ${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
