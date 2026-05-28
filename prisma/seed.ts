import { PrismaClient, ShiftStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedBase } from "./seed-base";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database (base + dev data)...\n");

  // ─── Base data (production-ready) ─────────────────────────────────────────
  await seedBase(prisma);

  console.log("\n🔧 Seeding development data...\n");

  // ─── Fetch references needed for dev data ─────────────────────────────────
  const [medicRole, secretaryRole, adminRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: "medic" } }),
    prisma.role.findUniqueOrThrow({ where: { name: "secretary" } }),
    prisma.role.findUniqueOrThrow({ where: { name: "admin" } }),
  ]);

  const specMedGen = await prisma.specialization.findUniqueOrThrow({ where: { name: "Medicina General" } });
  const specPediatria = await prisma.specialization.findUniqueOrThrow({ where: { name: "Pediatría" } });

  // ─── Users ────────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("password123", 12);

  const drGervilla = await prisma.user.upsert({
    where: { email: "dr.gervilla@consultorio.com" },
    update: { specializationId: specMedGen.id },
    create: {
      email: "dr.gervilla@consultorio.com",
      name: "Martín Gervilla",
      firstName: "Martín",
      lastName: "Gervilla",
      password: hashedPassword,
      specializationId: specMedGen.id,
    },
  });

  const draLopez = await prisma.user.upsert({
    where: { email: "dra.lopez@consultorio.com" },
    update: { specializationId: specPediatria.id },
    create: {
      email: "dra.lopez@consultorio.com",
      name: "Carolina López",
      firstName: "Carolina",
      lastName: "López",
      password: hashedPassword,
      specializationId: specPediatria.id,
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
      name: "Admin Sistema",
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

  // ─── Health Insurance references ──────────────────────────────────────────
  const insuranceNames = ["OSDE", "Swiss Medical", "Galeno", "Medifé", "IOMA", "PAMI", "Particular", "Unión Personal"];
  const insurances: Record<string, { id: string }> = {};
  for (const name of insuranceNames) {
    const ins = await prisma.healthInsurance.findFirst({ where: { name } });
    if (ins) insurances[name] = ins;
  }

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
      osId: insurances["OSDE"]?.id,
      osNumber: "12345678",
      emergencyContactName: "Lucía Pérez (Esposa)",
      emergencyContactPhone: "+54 11 4523-1100",
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
      osId: insurances["Swiss Medical"]?.id,
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
      osId: insurances["Galeno"]?.id,
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
      osId: insurances["OSDE"]?.id,
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
      osId: insurances["PAMI"]?.id,
      osNumber: "99001122",
      emergencyContactName: "Norma Fernández (Esposa)",
      emergencyContactPhone: "+54 11 3344-5577",
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
      osId: insurances["Medifé"]?.id,
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
      osId: insurances["Swiss Medical"]?.id,
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
      osId: insurances["IOMA"]?.id,
      osNumber: "44556677",
    },
    {
      firstName: "Pedro",
      lastName: "Álvarez",
      birthDate: new Date("1965-08-13"),
      dni: "18901234",
      email: "pedro.alvarez@email.com",
      telephone: "+54 11 2345-6789",
      address: "Tucumán 321, Piso 2 Dto B",
      country: "Argentina",
      province: "Tucumán",
      osId: insurances["PAMI"]?.id,
      osNumber: "11002233 / 02",
      emergencyContactName: "María Álvarez (Esposa)",
      emergencyContactPhone: "+54 11 4567-3322",
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
      osId: insurances["Particular"]?.id,
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
      osId: insurances["Galeno"]?.id,
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
      osId: insurances["Unión Personal"]?.id,
      osNumber: "22334455",
    },
  ];

  const patients: Array<{ id: string }> = [];
  for (const data of patientsData) {
    // Idempotent: upsert by unique DNI. If a patient with no DNI is added later,
    // fall back to a find-by-name approach.
    const patient = data.dni
      ? await prisma.patient.upsert({
          where: { dni: data.dni },
          update: data,
          create: data,
        })
      : await prisma.patient.create({ data });
    patients.push(patient);
  }
  console.log(`✅ ${patients.length} patients upserted`);

  // ─── Pedro Álvarez index (used for clinical seed below) ──────────────────
  const pedroIndex = patientsData.findIndex(
    (p) => p.firstName === "Pedro" && p.lastName === "Álvarez",
  );
  const pedroId = pedroIndex >= 0 ? patients[pedroIndex].id : null;

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

  // Idempotent: skip shifts that already exist for (userId, start) — Shift has
  // no unique constraint there, so we check before inserting.
  let createdShiftCount = 0;
  for (const shift of shifts) {
    const existing = await prisma.shift.findFirst({
      where: { userId: shift.userId, start: shift.start },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.shift.create({ data: shift });
    createdShiftCount++;
  }
  console.log(
    `✅ shifts: ${createdShiftCount} created, ${shifts.length - createdShiftCount} already existed`,
  );

  // ─── User Preferences ─────────────────────────────────────────────────────
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

  // ─── Block Days (with categories + notes) ─────────────────────────────────
  const blockDays: { date: Date; category: "VACATION" | "HOLIDAY" | "CONFERENCE" | "OTHER"; note: string | null }[] = [
    // Vacaciones de 3 días el próximo mes
    { date: new Date(currentYear, currentMonth + 1, 10), category: "VACATION", note: "Vacaciones de verano" },
    { date: new Date(currentYear, currentMonth + 1, 11), category: "VACATION", note: "Vacaciones de verano" },
    { date: new Date(currentYear, currentMonth + 1, 12), category: "VACATION", note: "Vacaciones de verano" },
    // Congreso médico
    { date: new Date(currentYear, currentMonth + 2, 5), category: "CONFERENCE", note: "Congreso de Cardiología 2026" },
    { date: new Date(currentYear, currentMonth + 2, 6), category: "CONFERENCE", note: "Congreso de Cardiología 2026" },
    // Feriado
    { date: new Date(currentYear, currentMonth + 1, 25), category: "HOLIDAY", note: "Feriado nacional" },
  ];

  for (const b of blockDays) {
    await prisma.blockDay.upsert({
      where: { userId_date: { userId: drGervilla.id, date: b.date } },
      update: { category: b.category, note: b.note },
      create: { userId: drGervilla.id, date: b.date, category: b.category, note: b.note },
    });
  }
  console.log(`✅ ${blockDays.length} block days upserted`);

  // ─── Clinical data for Pedro Álvarez (matches design handoff) ─────────────
  if (pedroId) {
    const structuredAllergies = [
      { nombre: "Penicilina", severidad: "alta", nota: "Reacción anafiláctica 2012" },
      { nombre: "Ibuprofeno", severidad: "media", nota: "Dispepsia" },
    ];

    const clinicalRecord = await prisma.clinicalRecord.upsert({
      where: { patientId: pedroId },
      update: {
        bloodType: "A+",
        heightCm: 172,
        weightKg: "78.00",
        personalHistory:
          "Hipertensión arterial diagnosticada en 2015. Dislipemia 2018. Apendicectomía en 1992. Cólico renal 2019 (litiasis urinaria, tratamiento conservador).",
        familyHistory:
          "Padre: HTA y enfermedad coronaria (IAM a los 68). Madre: diabetes tipo 2.\nHermano: HTA. Hijos: sin antecedentes relevantes.",
        currentMedication: "Enalapril 10mg · Atorvastatina 20mg · Aspirina 100mg",
        habitsTobacco: "Ex-fumador (dejó en 2010)",
        habitsAlcohol: "Ocasional (1–2 copas/sem)",
        habitsActivity: "Caminata 30 min, 3 veces por semana",
        habitsDiet: "Hiposódica",
        notes:
          "Paciente colaborador, asiste a controles trimestrales. Buena adherencia a tratamiento.",
        structuredAllergies: JSON.stringify(structuredAllergies),
      },
      create: {
        patientId: pedroId,
        bloodType: "A+",
        heightCm: 172,
        weightKg: "78.00",
        personalHistory:
          "Hipertensión arterial diagnosticada en 2015. Dislipemia 2018. Apendicectomía en 1992. Cólico renal 2019 (litiasis urinaria, tratamiento conservador).",
        familyHistory:
          "Padre: HTA y enfermedad coronaria (IAM a los 68). Madre: diabetes tipo 2.\nHermano: HTA. Hijos: sin antecedentes relevantes.",
        currentMedication: "Enalapril 10mg · Atorvastatina 20mg · Aspirina 100mg",
        habitsTobacco: "Ex-fumador (dejó en 2010)",
        habitsAlcohol: "Ocasional (1–2 copas/sem)",
        habitsActivity: "Caminata 30 min, 3 veces por semana",
        habitsDiet: "Hiposódica",
        notes:
          "Paciente colaborador, asiste a controles trimestrales. Buena adherencia a tratamiento.",
        structuredAllergies: JSON.stringify(structuredAllergies),
      },
    });
    console.log("✅ Clinical record for Pedro Álvarez upserted");

    // Evolutions — replace existing to avoid duplicates (no natural unique key)
    await prisma.evolution.deleteMany({
      where: { clinicalRecordId: clinicalRecord.id, userId: drGervilla.id },
    });

    const evolutions = [
      {
        clinicalRecordId: clinicalRecord.id,
        userId: drGervilla.id,
        reason:
          "Control trimestral de HTA. Refiere buen cumplimiento de tratamiento. Sin episodios de cefalea ni mareos.",
        physicalExam:
          "TA 130/80 mmHg. FC 72 lpm regular. Ruidos cardíacos normales. R1-R2 presentes, sin soplos. Pulsos periféricos conservados y simétricos.",
        diagnosis: "Hipertensión esencial",
        diagnosisCode: "I10",
        treatment:
          "Continuar enalapril 10 mg/día. Continuar atorvastatina 20 mg/día por la noche.",
        indications:
          "Continuar dieta hiposódica. Caminata diaria. MAPA en 6 meses. Próximo control en 3 meses.",
        notes: "Solicitar laboratorio: lipidograma, función renal, ionograma.",
        createdAt: new Date(currentYear, currentMonth - 1, 5, 10, 30),
      },
      {
        clinicalRecordId: clinicalRecord.id,
        userId: drGervilla.id,
        reason:
          "Control trimestral. Trae laboratorio de control: LDL 118, HDL 48, triglicéridos 142, creatinina 1.0, K+ 4.2.",
        physicalExam: "TA 128/78 mmHg. FC 68 lpm. Sin hallazgos patológicos.",
        diagnosis: "Hipertensión esencial",
        diagnosisCode: "I10",
        treatment: "Mantener esquema actual.",
        indications: "Próximo control en 3 meses con nuevo laboratorio.",
        createdAt: new Date(currentYear, currentMonth - 4, 15, 11, 0),
      },
      {
        clinicalRecordId: clinicalRecord.id,
        userId: drGervilla.id,
        reason:
          "Control. Paciente refiere ocasionales palpitaciones, sin disnea ni dolor torácico.",
        physicalExam:
          "TA 135/82 mmHg. FC 78 lpm regular. Resto del examen sin particularidades.",
        diagnosis: "Hipertensión esencial",
        diagnosisCode: "I10",
        treatment: "Mantener esquema. Indico Holter 24h.",
        indications:
          "Solicitar Holter 24 hs. Repetir laboratorio. Control en 1 mes con resultados.",
        createdAt: new Date(currentYear, currentMonth - 7, 8, 16, 30),
      },
      {
        clinicalRecordId: clinicalRecord.id,
        userId: drGervilla.id,
        reason: "Control anual. Paciente asintomático.",
        physicalExam: "Buen estado general. TA 125/80 mmHg. FC 70 lpm. IMC 26.4.",
        diagnosis: "Examen médico general",
        diagnosisCode: "Z00.0",
        treatment: "Mantener tratamiento actual.",
        indications: "Laboratorio anual. Ecodoppler cardíaco. ECG.",
        notes: "Paciente con buena adherencia.",
        createdAt: new Date(currentYear, currentMonth - 11, 12, 9, 30),
      },
    ];
    for (const evo of evolutions) {
      await prisma.evolution.create({ data: evo });
    }
    console.log(`✅ ${evolutions.length} evolutions for Pedro Álvarez`);

    // Prescriptions — replace existing to avoid duplicates
    await prisma.prescription.deleteMany({
      where: { patientId: pedroId, userId: drGervilla.id },
    });

    const prescriptions = [
      {
        patientId: pedroId,
        userId: drGervilla.id,
        diagnosis: "Hipertensión esencial",
        durationDays: 90,
        items: JSON.stringify([
          { medication: "Enalapril", dose: "10 mg", frequency: "1 vez al día", duration: "90 días", notes: "Por la mañana" },
          { medication: "Atorvastatina", dose: "20 mg", frequency: "1 vez al día (noche)", duration: "90 días" },
          { medication: "Aspirina Prevent", dose: "100 mg", frequency: "1 vez al día", duration: "90 días", notes: "Con desayuno" },
        ]),
        createdAt: new Date(currentYear, currentMonth - 1, 5),
      },
      {
        patientId: pedroId,
        userId: drGervilla.id,
        diagnosis: "Hipertensión esencial",
        durationDays: 90,
        items: JSON.stringify([
          { medication: "Enalapril", dose: "10 mg", frequency: "1 vez al día", duration: "90 días" },
          { medication: "Atorvastatina", dose: "20 mg", frequency: "1 vez al día (noche)", duration: "90 días" },
        ]),
        createdAt: new Date(currentYear, currentMonth - 4, 15),
      },
      {
        patientId: pedroId,
        userId: drGervilla.id,
        diagnosis: "Hipertensión esencial",
        durationDays: 90,
        items: JSON.stringify([
          { medication: "Enalapril", dose: "10 mg", frequency: "1 vez al día", duration: "90 días" },
        ]),
        createdAt: new Date(currentYear, currentMonth - 7, 8),
      },
    ];
    for (const presc of prescriptions) {
      await prisma.prescription.create({ data: presc });
    }
    console.log(`✅ ${prescriptions.length} prescriptions for Pedro Álvarez`);
  }

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
