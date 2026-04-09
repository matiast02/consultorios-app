import { PrismaClient, ShiftStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Roles ────────────────────────────────────────────────────────────────
  const [medicRole, secretaryRole, adminRole] = await Promise.all([
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

  const specMap: Record<string, { id: string }> = {};
  for (const name of specializations) {
    const spec = await prisma.specialization.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    specMap[name] = spec;
  }
  console.log("✅ Specializations created");

  // ─── Users ────────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("password123", 12);

  const drGervilla = await prisma.user.upsert({
    where: { email: "dr.gervilla@consultorio.com" },
    update: { specializationId: specMap["Medicina General"].id },
    create: {
      email: "dr.gervilla@consultorio.com",
      name: "Dr. Martín Gervilla",
      firstName: "Martín",
      lastName: "Gervilla",
      password: hashedPassword,
      specializationId: specMap["Medicina General"].id,
    },
  });

  const draLopez = await prisma.user.upsert({
    where: { email: "dra.lopez@consultorio.com" },
    update: { specializationId: specMap["Pediatría"].id },
    create: {
      email: "dra.lopez@consultorio.com",
      name: "Dra. Carolina López",
      firstName: "Carolina",
      lastName: "López",
      password: hashedPassword,
      specializationId: specMap["Pediatría"].id,
    },
  });

  const secMaria = await prisma.user.upsert({
    where: { email: "maria@consultorio.com" },
    update: {},
    create: {
      email: "maria@consultorio.com",
      name: "María González",
      firstName: "María",
      lastName: "González",
      password: hashedPassword,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@consultorio.com" },
    update: {},
    create: {
      email: "admin@consultorio.com",
      name: "Admin",
      firstName: "Admin",
      lastName: "Sistema",
      password: hashedPassword,
    },
  });

  console.log("✅ Users created");

  // ─── Assign Roles ─────────────────────────────────────────────────────────
  const roleAssignments = [
    { userId: drGervilla.id, roleId: medicRole.id },
    { userId: draLopez.id, roleId: medicRole.id },
    { userId: secMaria.id, roleId: secretaryRole.id },
    { userId: adminUser.id, roleId: adminRole.id },
  ];

  for (const assignment of roleAssignments) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: assignment.userId,
          roleId: assignment.roleId,
        },
      },
      update: {},
      create: assignment,
    });
  }
  console.log("✅ Roles assigned");

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

  const insurances: Record<string, { id: string }> = {};
  for (const os of osData) {
    const created = await prisma.healthInsurance.create({ data: os });
    insurances[os.name] = created;
  }
  console.log("✅ Health insurances created");

  // ─── Patients ─────────────────────────────────────────────────────────────
  const patientsData = [
    {
      firstName: "Juan",
      lastName: "Pérez",
      birthDate: new Date("1985-03-15"),
      dni: "28456789",
      email: "juan.perez@email.com",
      telephone: "1145678901",
      address: "Av. Corrientes 1234",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["OSDE"].id,
      osNumber: "12345678",
    },
    {
      firstName: "María",
      lastName: "García",
      birthDate: new Date("1990-07-22"),
      dni: "33456123",
      email: "maria.garcia@email.com",
      telephone: "1156789012",
      address: "Calle Florida 567",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["Swiss Medical"].id,
      osNumber: "87654321",
    },
    {
      firstName: "Carlos",
      lastName: "Rodríguez",
      birthDate: new Date("1978-11-03"),
      dni: "25789456",
      email: "carlos.rod@email.com",
      telephone: "1167890123",
      address: "Av. Santa Fe 890",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["Galeno"].id,
      osNumber: "11223344",
    },
    {
      firstName: "Ana",
      lastName: "Martínez",
      birthDate: new Date("1995-01-18"),
      dni: "36789012",
      email: "ana.martinez@email.com",
      telephone: "1178901234",
      address: "Belgrano 456",
      country: "Argentina",
      province: "Córdoba",
      osId: insurances["OSDE"].id,
      osNumber: "55667788",
    },
    {
      firstName: "Roberto",
      lastName: "Fernández",
      birthDate: new Date("1970-06-30"),
      dni: "22345678",
      email: "roberto.fernandez@email.com",
      telephone: "1189012345",
      address: "San Martín 789",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["PAMI"].id,
      osNumber: "99001122",
    },
    {
      firstName: "Laura",
      lastName: "Sánchez",
      birthDate: new Date("1988-09-12"),
      dni: "31234567",
      email: "laura.sanchez@email.com",
      telephone: "1190123456",
      address: "Rivadavia 2345",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["Medifé"].id,
      osNumber: "33445566",
    },
    {
      firstName: "Diego",
      lastName: "Torres",
      birthDate: new Date("1982-12-05"),
      dni: "27890123",
      email: "diego.torres@email.com",
      telephone: "1101234567",
      address: "Callao 678",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["Swiss Medical"].id,
      osNumber: "77889900",
    },
    {
      firstName: "Sofía",
      lastName: "Morales",
      birthDate: new Date("2000-04-25"),
      dni: "40123456",
      email: "sofia.morales@email.com",
      telephone: "1112345678",
      address: "Av. de Mayo 1010",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["IOMA"].id,
      osNumber: "44556677",
    },
    {
      firstName: "Pedro",
      lastName: "Álvarez",
      birthDate: new Date("1965-08-14"),
      dni: "18901234",
      email: "pedro.alvarez@email.com",
      telephone: "1123456789",
      address: "Tucumán 321",
      country: "Argentina",
      province: "Tucumán",
      osId: insurances["PAMI"].id,
      osNumber: "11002233",
    },
    {
      firstName: "Valentina",
      lastName: "Romero",
      birthDate: new Date("1993-02-28"),
      dni: "35012345",
      email: "valentina.romero@email.com",
      telephone: "1134567890",
      address: "Mitre 555",
      country: "Argentina",
      province: "Santa Fe",
      osId: insurances["Particular"].id,
      osNumber: undefined,
    },
    {
      firstName: "Luciano",
      lastName: "Díaz",
      birthDate: new Date("1987-05-10"),
      dni: "30567890",
      telephone: "1145670000",
      address: "Sarmiento 1500",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["Galeno"].id,
      osNumber: "66778899",
    },
    {
      firstName: "Camila",
      lastName: "Herrera",
      birthDate: new Date("1998-10-08"),
      dni: "38234567",
      email: "camila.herrera@email.com",
      telephone: "1156780000",
      address: "Av. Libertador 4321",
      country: "Argentina",
      province: "Buenos Aires",
      osId: insurances["Unión Personal"].id,
      osNumber: "22334455",
    },
  ];

  const patients: Array<{ id: string }> = [];
  for (const data of patientsData) {
    const patient = await prisma.patient.create({ data });
    patients.push(patient);
  }
  console.log(`✅ ${patients.length} patients created`);

  // ─── Shifts (Turnos) ──────────────────────────────────────────────────────
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const shifts = [
    // Past shifts (last month) — finished/absent
    {
      userId: drGervilla.id,
      patientId: patients[0].id,
      start: new Date(currentYear, currentMonth - 1, 5, 9, 0),
      end: new Date(currentYear, currentMonth - 1, 5, 9, 30),
      status: ShiftStatus.FINISHED,
      observations: "Control de rutina. Paciente en buen estado general.",
    },
    {
      userId: drGervilla.id,
      patientId: patients[1].id,
      start: new Date(currentYear, currentMonth - 1, 5, 10, 0),
      end: new Date(currentYear, currentMonth - 1, 5, 10, 30),
      status: ShiftStatus.ABSENT,
    },
    {
      userId: draLopez.id,
      patientId: patients[7].id,
      start: new Date(currentYear, currentMonth - 1, 8, 14, 0),
      end: new Date(currentYear, currentMonth - 1, 8, 14, 30),
      status: ShiftStatus.FINISHED,
      observations: "Consulta por dolor abdominal. Se solicitan estudios.",
    },
    {
      userId: drGervilla.id,
      patientId: patients[2].id,
      start: new Date(currentYear, currentMonth - 1, 12, 11, 0),
      end: new Date(currentYear, currentMonth - 1, 12, 11, 30),
      status: ShiftStatus.FINISHED,
      observations: "Control de presión arterial. Valores normales.",
    },
    {
      userId: draLopez.id,
      patientId: patients[5].id,
      start: new Date(currentYear, currentMonth - 1, 15, 9, 0),
      end: new Date(currentYear, currentMonth - 1, 15, 9, 30),
      status: ShiftStatus.FINISHED,
      observations: "Control ginecológico anual.",
    },
    {
      userId: drGervilla.id,
      patientId: patients[4].id,
      start: new Date(currentYear, currentMonth - 1, 18, 10, 0),
      end: new Date(currentYear, currentMonth - 1, 18, 10, 30),
      status: ShiftStatus.CANCELLED,
    },
    {
      userId: draLopez.id,
      patientId: patients[3].id,
      start: new Date(currentYear, currentMonth - 1, 20, 15, 0),
      end: new Date(currentYear, currentMonth - 1, 20, 15, 30),
      status: ShiftStatus.FINISHED,
      observations: "Vacunación anual aplicada.",
    },

    // Current month shifts — mix of statuses
    {
      userId: drGervilla.id,
      patientId: patients[0].id,
      start: new Date(currentYear, currentMonth, 2, 9, 0),
      end: new Date(currentYear, currentMonth, 2, 9, 30),
      status: ShiftStatus.FINISHED,
      observations: "Seguimiento. Resultados de laboratorio normales.",
    },
    {
      userId: drGervilla.id,
      patientId: patients[3].id,
      start: new Date(currentYear, currentMonth, 2, 10, 0),
      end: new Date(currentYear, currentMonth, 2, 10, 30),
      status: ShiftStatus.FINISHED,
      observations: "Consulta por alergia estacional. Receta antihistamínico.",
    },
    {
      userId: draLopez.id,
      patientId: patients[6].id,
      start: new Date(currentYear, currentMonth, 3, 14, 0),
      end: new Date(currentYear, currentMonth, 3, 14, 30),
      status: ShiftStatus.ABSENT,
    },
    {
      userId: drGervilla.id,
      patientId: patients[8].id,
      start: new Date(currentYear, currentMonth, 5, 9, 0),
      end: new Date(currentYear, currentMonth, 5, 9, 30),
      status: ShiftStatus.CONFIRMED,
    },
    {
      userId: draLopez.id,
      patientId: patients[9].id,
      start: new Date(currentYear, currentMonth, 5, 16, 0),
      end: new Date(currentYear, currentMonth, 5, 16, 30),
      status: ShiftStatus.FINISHED,
      observations: "Chequeo general. Todo en orden.",
    },
    {
      userId: drGervilla.id,
      patientId: patients[10].id,
      start: new Date(currentYear, currentMonth, 8, 10, 0),
      end: new Date(currentYear, currentMonth, 8, 10, 30),
      status: ShiftStatus.CONFIRMED,
    },

    // Upcoming shifts — pending
    {
      userId: drGervilla.id,
      patientId: patients[1].id,
      start: new Date(currentYear, currentMonth, 15, 9, 0),
      end: new Date(currentYear, currentMonth, 15, 9, 30),
      status: ShiftStatus.PENDING,
    },
    {
      userId: drGervilla.id,
      patientId: patients[5].id,
      start: new Date(currentYear, currentMonth, 15, 10, 0),
      end: new Date(currentYear, currentMonth, 15, 10, 30),
      status: ShiftStatus.PENDING,
    },
    {
      userId: draLopez.id,
      patientId: patients[2].id,
      start: new Date(currentYear, currentMonth, 16, 14, 0),
      end: new Date(currentYear, currentMonth, 16, 14, 30),
      status: ShiftStatus.PENDING,
    },
    {
      userId: drGervilla.id,
      patientId: patients[11].id,
      start: new Date(currentYear, currentMonth, 18, 11, 0),
      end: new Date(currentYear, currentMonth, 18, 11, 30),
      status: ShiftStatus.PENDING,
    },
    {
      userId: draLopez.id,
      patientId: patients[4].id,
      start: new Date(currentYear, currentMonth, 20, 15, 0),
      end: new Date(currentYear, currentMonth, 20, 15, 30),
      status: ShiftStatus.PENDING,
    },
    {
      userId: drGervilla.id,
      patientId: patients[7].id,
      start: new Date(currentYear, currentMonth, 22, 9, 30),
      end: new Date(currentYear, currentMonth, 22, 10, 0),
      status: ShiftStatus.PENDING,
    },
    {
      userId: draLopez.id,
      patientId: patients[9].id,
      start: new Date(currentYear, currentMonth, 25, 14, 30),
      end: new Date(currentYear, currentMonth, 25, 15, 0),
      status: ShiftStatus.PENDING,
    },

    // Next month
    {
      userId: drGervilla.id,
      patientId: patients[0].id,
      start: new Date(currentYear, currentMonth + 1, 3, 9, 0),
      end: new Date(currentYear, currentMonth + 1, 3, 9, 30),
      status: ShiftStatus.PENDING,
    },
    {
      userId: draLopez.id,
      patientId: patients[6].id,
      start: new Date(currentYear, currentMonth + 1, 5, 10, 0),
      end: new Date(currentYear, currentMonth + 1, 5, 10, 30),
      status: ShiftStatus.PENDING,
    },
  ];

  for (const shift of shifts) {
    await prisma.shift.create({ data: shift });
  }
  console.log(`✅ ${shifts.length} shifts created`);

  // ─── User Preferences ─────────────────────────────────────────────────────
  // Dr. Gervilla works Mon-Fri, mornings and afternoons
  const gervillaPrefs = [
    { day: 1, fromHourAM: "08:00", toHourAM: "12:00", fromHourPM: "14:00", toHourPM: "18:00" },
    { day: 2, fromHourAM: "08:00", toHourAM: "12:00", fromHourPM: "14:00", toHourPM: "18:00" },
    { day: 3, fromHourAM: "08:00", toHourAM: "12:00", fromHourPM: null, toHourPM: null },
    { day: 4, fromHourAM: "08:00", toHourAM: "12:00", fromHourPM: "14:00", toHourPM: "18:00" },
    { day: 5, fromHourAM: "08:00", toHourAM: "12:00", fromHourPM: null, toHourPM: null },
  ];

  for (const pref of gervillaPrefs) {
    await prisma.userPreference.upsert({
      where: { userId_day: { userId: drGervilla.id, day: pref.day } },
      update: pref,
      create: { userId: drGervilla.id, ...pref },
    });
  }

  // Dra. López works Mon, Wed, Fri afternoons only
  const lopezPrefs = [
    { day: 1, fromHourAM: null, toHourAM: null, fromHourPM: "14:00", toHourPM: "19:00" },
    { day: 3, fromHourAM: null, toHourAM: null, fromHourPM: "14:00", toHourPM: "19:00" },
    { day: 5, fromHourAM: null, toHourAM: null, fromHourPM: "14:00", toHourPM: "19:00" },
  ];

  for (const pref of lopezPrefs) {
    await prisma.userPreference.upsert({
      where: { userId_day: { userId: draLopez.id, day: pref.day } },
      update: pref,
      create: { userId: draLopez.id, ...pref },
    });
  }
  console.log("✅ User preferences created");

  // ─── Block Days ───────────────────────────────────────────────────────────
  // Dr. Gervilla blocks a few days next month
  const blockDays = [
    new Date(currentYear, currentMonth + 1, 10),
    new Date(currentYear, currentMonth + 1, 11),
    new Date(currentYear, currentMonth + 1, 12),
  ];

  for (const date of blockDays) {
    await prisma.blockDay.upsert({
      where: { userId_date: { userId: drGervilla.id, date } },
      update: {},
      create: { userId: drGervilla.id, date },
    });
  }
  console.log("✅ Block days created");

  // ─── Module Config ────────────────────────────────────────────────────────
  await prisma.moduleConfig.upsert({
    where: { module: "prescriptions" },
    update: {},
    create: { module: "prescriptions", name: "Recetas Medicas", enabled: true },
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

  // ─── Consultation Types ────────────────────────────────────────────────────
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

  console.log("\n🎉 Seed completed successfully!");
  console.log("\n📋 Test credentials:");
  console.log("  Dr. Gervilla:  dr.gervilla@consultorio.com / password123");
  console.log("  Dra. López:    dra.lopez@consultorio.com / password123");
  console.log("  Secretaria:    maria@consultorio.com / password123");
  console.log("  Admin:         admin@consultorio.com / password123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
