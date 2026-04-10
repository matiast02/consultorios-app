import { PrismaClient } from "@prisma/client";

/**
 * Seed base — datos maestros para produccion y desarrollo.
 * Se puede ejecutar de forma independiente o ser importado desde seed.ts.
 */
export async function seedBase(prisma: PrismaClient) {
  // ─── Roles ────────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.role.upsert({
      where: { name: "medic" },
      update: {},
      create: { name: "medic" },
    }),
    prisma.role.upsert({
      where: { name: "secretary" },
      update: {},
      create: { name: "secretary" },
    }),
    prisma.role.upsert({
      where: { name: "admin" },
      update: {},
      create: { name: "admin" },
    }),
  ]);
  console.log("✅ Roles created");

  // ─── Profession Configs ───────────────────────────────────────────────────
  const medicConfig = await prisma.professionConfig.upsert({
    where: { code: "medic" },
    update: {},
    create: {
      code: "medic",
      name: "Médico",
      professionalLabel: "Dr/a.",
      patientLabel: "Paciente",
      prescriptionLabel: "Receta",
      evolutionLabel: "Evolución",
      clinicalRecordLabel: "Historia Clínica",
      enabledModules: JSON.stringify(["prescriptions", "study_orders"]),
      clinicalFields: JSON.stringify(["bloodType", "allergies", "personalHistory", "familyHistory", "currentMedication"]),
    },
  });

  const psychologistConfig = await prisma.professionConfig.upsert({
    where: { code: "psychologist" },
    update: {},
    create: {
      code: "psychologist",
      name: "Psicólogo",
      professionalLabel: "Lic.",
      patientLabel: "Paciente",
      prescriptionLabel: "Indicación",
      evolutionLabel: "Nota de sesión",
      clinicalRecordLabel: "Ficha Psicológica",
      enabledModules: JSON.stringify(["study_orders"]),
      clinicalFields: JSON.stringify(["personalHistory", "familyHistory", "consultReason", "previousTherapy", "psychodiagnosis", "genogram"]),
    },
  });

  const dentistConfig = await prisma.professionConfig.upsert({
    where: { code: "dentist" },
    update: {},
    create: {
      code: "dentist",
      name: "Dentista",
      professionalLabel: "Od.",
      patientLabel: "Paciente",
      prescriptionLabel: "Plan de tratamiento",
      evolutionLabel: "Registro odontológico",
      clinicalRecordLabel: "Ficha Odontológica",
      enabledModules: JSON.stringify(["prescriptions", "study_orders"]),
      clinicalFields: JSON.stringify(["allergies", "currentMedication", "dentalHistory", "odontogram"]),
    },
  });

  console.log("✅ Profession configs created");

  // ─── Specializations ──────────────────────────────────────────────────────
  const specializations = [
    "Medicina General",
    "Pediatría",
    "Cardiología",
    "Dermatología",
    "Ginecología",
    "Traumatología",
    "Oftalmología",
    "Neurología",
    "Psiquiatría",
    "Nutrición",
  ];

  const specProfessionMap: Record<string, string> = {
    "Medicina General": medicConfig.id,
    "Pediatría": medicConfig.id,
    "Cardiología": medicConfig.id,
    "Dermatología": medicConfig.id,
    "Ginecología": medicConfig.id,
    "Traumatología": medicConfig.id,
    "Oftalmología": medicConfig.id,
    "Neurología": medicConfig.id,
    "Psiquiatría": psychologistConfig.id,
    "Nutrición": medicConfig.id,
  };

  for (const name of specializations) {
    const profConfigId = specProfessionMap[name] ?? null;
    await prisma.specialization.upsert({
      where: { name },
      update: { professionConfigId: profConfigId },
      create: { name, professionConfigId: profConfigId },
    });
  }
  console.log("✅ Specializations created");

  // ─── Health Insurance (Obras Sociales) ────────────────────────────────────
  const osData = [
    { name: "OSDE", code: "400" },
    { name: "Swiss Medical", code: "401" },
    { name: "Galeno", code: "402" },
    { name: "Medifé", code: "403" },
    { name: "IOMA", code: "500" },
    { name: "PAMI", code: "600" },
    { name: "Particular", code: "000" },
    { name: "Unión Personal", code: "404" },
  ];

  for (const os of osData) {
    let existing = await prisma.healthInsurance.findFirst({ where: { name: os.name } });
    if (!existing) {
      await prisma.healthInsurance.create({ data: os });
    }
  }
  console.log("✅ Health insurances created");

  // ─── Consultation Types ───────────────────────────────────────────────────
  const consultationTypesData = [
    { name: "Primera vez", durationMinutes: 40, color: "#8B5CF6", isDefault: true },
    { name: "Control", durationMinutes: 20, color: "#06B6D4", isDefault: false },
    { name: "Urgencia", durationMinutes: 15, color: "#EF4444", isDefault: false },
    { name: "Seguimiento", durationMinutes: 30, color: "#F59E0B", isDefault: false },
  ];

  for (const ct of consultationTypesData) {
    await prisma.consultationType.upsert({
      where: { name: ct.name },
      update: {},
      create: ct,
    });
  }
  console.log("✅ Consultation types created");

  // ─── Module Config ────────────────────────────────────────────────────────
  await prisma.moduleConfig.upsert({
    where: { module: "prescriptions" },
    update: {},
    create: { module: "prescriptions", name: "Recetas Medicas", enabled: true },
  });
  await prisma.moduleConfig.upsert({
    where: { module: "study_orders" },
    update: {},
    create: { module: "study_orders", name: "Ordenes de Estudio", enabled: true },
  });
  console.log("✅ Module config created");

  // ─── Medications (Vademécum) ──────────────────────────────────────────────
  const medications = [
    { name: "Ibuprofeno 400mg", genericName: "Ibuprofeno", presentation: "Comprimidos", category: "Analgésico/Antiinflamatorio" },
    { name: "Ibuprofeno 600mg", genericName: "Ibuprofeno", presentation: "Comprimidos", category: "Analgésico/Antiinflamatorio" },
    { name: "Paracetamol 500mg", genericName: "Paracetamol", presentation: "Comprimidos", category: "Analgésico/Antipirético" },
    { name: "Paracetamol 1g", genericName: "Paracetamol", presentation: "Comprimidos", category: "Analgésico/Antipirético" },
    { name: "Amoxicilina 500mg", genericName: "Amoxicilina", presentation: "Cápsulas", category: "Antibiótico" },
    { name: "Amoxicilina 875mg + Ác. Clavulánico", genericName: "Amoxicilina/Clavulánico", presentation: "Comprimidos", category: "Antibiótico" },
    { name: "Azitromicina 500mg", genericName: "Azitromicina", presentation: "Comprimidos", category: "Antibiótico" },
    { name: "Cefalexina 500mg", genericName: "Cefalexina", presentation: "Cápsulas", category: "Antibiótico" },
    { name: "Ciprofloxacina 500mg", genericName: "Ciprofloxacina", presentation: "Comprimidos", category: "Antibiótico" },
    { name: "Omeprazol 20mg", genericName: "Omeprazol", presentation: "Cápsulas", category: "Protector gástrico" },
    { name: "Pantoprazol 40mg", genericName: "Pantoprazol", presentation: "Comprimidos", category: "Protector gástrico" },
    { name: "Ranitidina 150mg", genericName: "Ranitidina", presentation: "Comprimidos", category: "Protector gástrico" },
    { name: "Loratadina 10mg", genericName: "Loratadina", presentation: "Comprimidos", category: "Antihistamínico" },
    { name: "Cetirizina 10mg", genericName: "Cetirizina", presentation: "Comprimidos", category: "Antihistamínico" },
    { name: "Diclofenac 75mg", genericName: "Diclofenac", presentation: "Comprimidos", category: "Antiinflamatorio" },
    { name: "Dexametasona 4mg", genericName: "Dexametasona", presentation: "Comprimidos", category: "Corticoide" },
    { name: "Prednisona 20mg", genericName: "Prednisona", presentation: "Comprimidos", category: "Corticoide" },
    { name: "Metformina 850mg", genericName: "Metformina", presentation: "Comprimidos", category: "Antidiabético" },
    { name: "Enalapril 10mg", genericName: "Enalapril", presentation: "Comprimidos", category: "Antihipertensivo" },
    { name: "Losartán 50mg", genericName: "Losartán", presentation: "Comprimidos", category: "Antihipertensivo" },
    { name: "Atenolol 50mg", genericName: "Atenolol", presentation: "Comprimidos", category: "Betabloqueante" },
    { name: "Amlodipina 5mg", genericName: "Amlodipina", presentation: "Comprimidos", category: "Antihipertensivo" },
    { name: "Atorvastatina 20mg", genericName: "Atorvastatina", presentation: "Comprimidos", category: "Hipolipemiante" },
    { name: "Aspirina 100mg", genericName: "Ácido acetilsalicílico", presentation: "Comprimidos", category: "Antiagregante" },
    { name: "Clonazepam 0.5mg", genericName: "Clonazepam", presentation: "Comprimidos", category: "Ansiolítico" },
    { name: "Alprazolam 0.5mg", genericName: "Alprazolam", presentation: "Comprimidos", category: "Ansiolítico" },
    { name: "Levotiroxina 50mcg", genericName: "Levotiroxina", presentation: "Comprimidos", category: "Hormona tiroidea" },
    { name: "Metoclopramida 10mg", genericName: "Metoclopramida", presentation: "Comprimidos", category: "Antiemético" },
    { name: "Buscapina 10mg", genericName: "Hioscina", presentation: "Comprimidos", category: "Antiespasmódico" },
    { name: "Salbutamol 100mcg", genericName: "Salbutamol", presentation: "Aerosol", category: "Broncodilatador" },
    { name: "Fluticasona 250mcg", genericName: "Fluticasona", presentation: "Aerosol", category: "Corticoide inhalado" },
    { name: "Hierro polimaltosato", genericName: "Hierro", presentation: "Comprimidos masticables", category: "Suplemento" },
    { name: "Ácido fólico 5mg", genericName: "Ácido fólico", presentation: "Comprimidos", category: "Vitamina" },
    { name: "Complejo vitamínico B", genericName: "Vitaminas B1, B6, B12", presentation: "Comprimidos", category: "Vitamina" },
    { name: "Vitamina D3 1000 UI", genericName: "Colecalciferol", presentation: "Gotas", category: "Vitamina" },
    { name: "Clotrimazol crema 1%", genericName: "Clotrimazol", presentation: "Crema", category: "Antimicótico tópico" },
    { name: "Mupirocina crema 2%", genericName: "Mupirocina", presentation: "Crema", category: "Antibiótico tópico" },
    { name: "Betametasona crema 0.05%", genericName: "Betametasona", presentation: "Crema", category: "Corticoide tópico" },
    { name: "Tramadol 50mg", genericName: "Tramadol", presentation: "Cápsulas", category: "Analgésico opioide" },
    { name: "Gabapentina 300mg", genericName: "Gabapentina", presentation: "Cápsulas", category: "Anticonvulsivante/Neuropático" },
  ];

  for (const med of medications) {
    await prisma.medication.upsert({
      where: { name: med.name },
      update: {},
      create: med,
    });
  }
  console.log(`✅ ${medications.length} medications created`);
}

// ─── Standalone execution ─────────────────────────────────────────────────
// Runs when executed directly via `tsx prisma/seed-base.ts` or `node prisma/seed-base.cjs`
// Does NOT run when imported from seed.ts (seed.ts calls seedBase() directly)
const isDirectExecution =
  require.main === module ||
  process.argv[1]?.includes("seed-base");

if (isDirectExecution) {
  const prisma = new PrismaClient();
  seedBase(prisma)
    .then(async () => {
      console.log("\n🎉 Base seed completed successfully!");
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error("❌ Base seed failed:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
