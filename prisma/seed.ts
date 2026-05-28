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

  // ─── Consultation type references (created by seedBase) ──────────────────
  const [ctControlRow, ctPrimeraRow, ctUrgenciaRow, ctSeguimientoRow, ctRecetaRow, ctEstudioRow] = await Promise.all([
    prisma.consultationType.findUnique({ where: { name: "Control" } }),
    prisma.consultationType.findUnique({ where: { name: "Primera consulta" } }),
    prisma.consultationType.findUnique({ where: { name: "Urgencia" } }),
    prisma.consultationType.findUnique({ where: { name: "Seguimiento" } }),
    prisma.consultationType.findUnique({ where: { name: "Receta" } }),
    prisma.consultationType.findUnique({ where: { name: "Estudio" } }),
  ]);
  const ct = {
    control: ctControlRow?.id ?? null,
    primera: ctPrimeraRow?.id ?? null,
    urgencia: ctUrgenciaRow?.id ?? null,
    seguimiento: ctSeguimientoRow?.id ?? null,
    receta: ctRecetaRow?.id ?? null,
    estudio: ctEstudioRow?.id ?? null,
  };

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

  // ─── Calendar enrichment: assign consultation types ──────────────────────
  // Heuristic-based backfill so the redesigned calendar surface (which renders
  // `consultationType.name` in DayView / Rail / Agenda) shows meaningful data
  // for all seeded shifts, including those originally created without a type.
  const shiftsToType = await prisma.shift.findMany({
    where: {
      userId: { in: [drGervilla.id, draLopez.id] },
      consultationTypeId: null,
    },
    select: { id: true, observations: true },
  });
  let typedCount = 0;
  for (const s of shiftsToType) {
    const obs = (s.observations ?? "").toLowerCase();
    let typeId: string | null = ct.control;
    if (obs.includes("dolor") || obs.includes("alergia") || obs.includes("primera"))
      typeId = ct.primera;
    else if (obs.includes("seguimiento") || obs.includes("laboratorio"))
      typeId = ct.seguimiento;
    if (typeId) {
      await prisma.shift.update({ where: { id: s.id }, data: { consultationTypeId: typeId } });
      typedCount++;
    }
  }
  console.log(`✅ Consultation type assigned to ${typedCount} shifts`);

  // ─── Calendar/Dashboard enrichment: extra patients for today's design ─────
  // Idempotent: upsert by DNI. These match the patient names shown in the
  // redesigned medic dashboard.
  const extraPatientsData = [
    { firstName: "Valentina", lastName: "Martínez", dni: "31876543", telephone: "1144556677", osKey: "Particular", birthDate: new Date("1989-04-12") },
    { firstName: "Camila",    lastName: "González", dni: "39456789", telephone: "1155667788", osKey: "Medifé",     birthDate: new Date("1996-07-21") },
    { firstName: "Mateo",     lastName: "Romero",   dni: "32567890", telephone: "1166778899", osKey: "IOMA",       birthDate: new Date("1986-11-30") },
    { firstName: "Florencia", lastName: "Torres",   dni: "34678901", telephone: "1177889900", osKey: "Swiss Medical", birthDate: new Date("1990-02-08") },
    { firstName: "Felipe",    lastName: "Moreno",   dni: "29345678", telephone: "1188990011", osKey: "IOMA",       birthDate: new Date("1983-09-14") },
    { firstName: "Isabella",  lastName: "Vega",     dni: "37234567", telephone: "1199001122", osKey: "Particular", birthDate: new Date("1994-05-19") },
    { firstName: "Lucas",     lastName: "Rodríguez", dni: "33891234", telephone: "1100112233", osKey: "OSDE",      birthDate: new Date("1988-12-03") },
    { firstName: "Lucía",     lastName: "Suárez",   dni: "16123456", telephone: "1111223344", osKey: "PAMI",       birthDate: new Date("1958-03-25") },
    { firstName: "Tomás",     lastName: "Benítez",  dni: "35345678", telephone: "1122334455", osKey: "Galeno",     birthDate: new Date("1991-08-17") },
    { firstName: "Renata",    lastName: "Castro",   dni: "30456789", telephone: "1133445566", osKey: "OSDE",       birthDate: new Date("1987-06-09") },
    { firstName: "Bruno",     lastName: "Acosta",   dni: "27567890", telephone: "1144556678", osKey: "Swiss Medical", birthDate: new Date("1982-01-22") },
  ];
  const extraPatients: Record<string, { id: string }> = {};
  for (const p of extraPatientsData) {
    const osId = p.osKey ? insurances[p.osKey]?.id : undefined;
    const data = {
      firstName: p.firstName,
      lastName: p.lastName,
      dni: p.dni,
      telephone: p.telephone,
      birthDate: p.birthDate,
      osId,
    };
    const created = await prisma.patient.upsert({
      where: { dni: p.dni },
      update: data,
      create: data,
    });
    extraPatients[`${p.firstName} ${p.lastName}`] = created;
  }
  console.log(`✅ ${extraPatientsData.length} dashboard patients upserted`);

  // Update existing María García's OS to IOMA to match the dashboard design
  await prisma.patient.update({
    where: { dni: "33456123" },
    data: { osId: insurances["IOMA"]?.id ?? null },
  });

  // ─── Dashboard enrichment: today's shifts (matches design) ────────────────
  // Idempotent: clean ALL of Gervilla's shifts in the current week first to
  // avoid leftover counts from prior runs or other seed sections.
  const todayMarker = "";
  const setT = (base: Date, h: number, m: number): Date => {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute Monday-of-week / next Monday
  const _mondayClean = new Date(today);
  const _dow = _mondayClean.getDay() === 0 ? 7 : _mondayClean.getDay();
  _mondayClean.setDate(_mondayClean.getDate() - (_dow - 1));
  _mondayClean.setHours(0, 0, 0, 0);
  const _nextMondayClean = new Date(_mondayClean);
  _nextMondayClean.setDate(_nextMondayClean.getDate() + 7);

  await prisma.shift.deleteMany({
    where: {
      userId: drGervilla.id,
      start: { gte: _mondayClean, lt: _nextMondayClean },
    },
  });

  // Patient lookup helper
  const pid = (key: string): string => {
    const p = extraPatients[key];
    if (!p) throw new Error(`Missing extra patient: ${key}`);
    return p.id;
  };

  // Map existing seeded patients by name for clarity
  const juanPerez = patients[0].id;
  const mariaGarcia = patients[1].id;

  const designedShifts: Array<{
    patientId: string;
    h: number; m: number; durMin: number;
    status: ShiftStatus;
    ctId: string | null;
    obs: string;
  }> = [
    // ─ Atendidos ─
    { patientId: juanPerez,                  h: 8,  m: 0,  durMin: 30, status: ShiftStatus.FINISHED,  ctId: ct.control,   obs: `Control de rutina. Paciente en buen estado general.` },
    { patientId: pid("Valentina Martínez"),  h: 8,  m: 30, durMin: 30, status: ShiftStatus.FINISHED,  ctId: ct.receta,    obs: `Renovación de medicación` },
    // ─ Ausente ─
    { patientId: mariaGarcia,                h: 9,  m: 0,  durMin: 30, status: ShiftStatus.ABSENT,    ctId: ct.control,   obs: `No asistió, sin aviso` },
    // ─ Próximo (Confirmado) ─
    { patientId: pid("Camila González"),     h: 9,  m: 30, durMin: 30, status: ShiftStatus.CONFIRMED, ctId: ct.primera,   obs: `Palpitaciones nocturnas` },
    // ─ Confirmados ─
    { patientId: pid("Mateo Romero"),        h: 10, m: 0,  durMin: 30, status: ShiftStatus.CONFIRMED, ctId: ct.estudio,   obs: `Ergometría programada` },
    // ─ Pendientes mañana ─
    { patientId: pid("Florencia Torres"),    h: 10, m: 30, durMin: 30, status: ShiftStatus.PENDING,   ctId: ct.control,   obs: `Control trimestral` },
    { patientId: pid("Felipe Moreno"),       h: 11, m: 0,  durMin: 30, status: ShiftStatus.PENDING,   ctId: ct.seguimiento, obs: `Post-internación` },
    { patientId: pid("Isabella Vega"),       h: 11, m: 30, durMin: 30, status: ShiftStatus.PENDING,   ctId: ct.control,   obs: `Control HTA` },
    // ─ PAUSA 13:00–14:00 (sin turnos) ─
    // ─ Tarde ─
    { patientId: pid("Lucas Rodríguez"),     h: 14, m: 30, durMin: 30, status: ShiftStatus.CONFIRMED, ctId: ct.primera,   obs: `Derivada por médico clínico` },
    { patientId: pid("Lucía Suárez"),        h: 15, m: 0,  durMin: 30, status: ShiftStatus.CONFIRMED, ctId: ct.receta,    obs: `Renovación trimestral` },
    { patientId: pid("Tomás Benítez"),       h: 15, m: 30, durMin: 30, status: ShiftStatus.PENDING,   ctId: ct.control,   obs: `Control de presión` },
    { patientId: pid("Renata Castro"),       h: 16, m: 0,  durMin: 30, status: ShiftStatus.PENDING,   ctId: ct.seguimiento, obs: `Seguimiento post-quirúrgico` },
    { patientId: pid("Bruno Acosta"),        h: 16, m: 30, durMin: 30, status: ShiftStatus.PENDING,   ctId: ct.control,   obs: `Control anual` },
  ];

  for (const t of designedShifts) {
    const start = setT(today, t.h, t.m);
    const end = new Date(start.getTime() + t.durMin * 60_000);
    await prisma.shift.create({
      data: {
        userId: drGervilla.id,
        patientId: t.patientId,
        start,
        end,
        status: t.status,
        observations: t.obs,
        consultationTypeId: t.ctId ?? null,
      },
    });
  }
  console.log(`✅ ${designedShifts.length} dashboard shifts created for today`);

  // ─── Dashboard enrichment: this week's shifts for bar chart ────────────────
  // Target: Mon 9, Tue 6, Wed 5, Thu (today, already done), Fri 5
  // (the previous deleteMany above already cleared all week shifts)
  const monday = new Date(today);
  const dayOfWeek = monday.getDay() === 0 ? 7 : monday.getDay(); // Sun=7, Mon=1
  monday.setDate(monday.getDate() - (dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const todayOffsetForPlan = (today.getDay() === 0 ? 7 : today.getDay()) - 1;
  const weekPlan: Array<{ offset: number; count: number }> = [
    { offset: 0, count: 9 }, // Monday
    { offset: 1, count: 6 }, // Tuesday
    { offset: 2, count: 5 }, // Wednesday
    { offset: 4, count: 5 }, // Friday
  ].filter((p) => p.offset !== todayOffsetForPlan);

  // Reuse existing patient ids (cycle through them)
  const allPatientIds = patients.map((p) => p.id).concat(Object.values(extraPatients).map((p) => p.id));
  const variedCtIds = [ct.control, ct.primera, ct.seguimiento, ct.receta, ct.estudio].filter(Boolean) as string[];

  const todayOffset = (today.getDay() === 0 ? 7 : today.getDay()) - 1; // 0=Mon..6=Sun

  let weekShiftIdx = 0;
  const weekShiftsCreated: Array<{ id: string; isFinishedMonTue: boolean; patientId: string; isPastDay: boolean }> = [];
  for (const wd of weekPlan) {
    const dayDate = new Date(monday);
    dayDate.setDate(dayDate.getDate() + wd.offset);
    // Spread the shifts across morning/afternoon
    const startHour = 8;
    for (let i = 0; i < wd.count; i++) {
      const slotIdx = i;
      const h = startHour + Math.floor(slotIdx / 2);
      const m = (slotIdx % 2) * 30;
      // Skip lunch slot (13:00–14:00)
      let hh = h, mm = m;
      if (hh === 13) { hh = 14; }
      const start = setT(dayDate, hh, mm);
      const end = new Date(start.getTime() + 30 * 60_000);
      const isPastDay = wd.offset < todayOffset;
      const status = isPastDay ? ShiftStatus.FINISHED : ShiftStatus.PENDING;
      const patientId = allPatientIds[(weekShiftIdx + 3) % allPatientIds.length];
      const ctId = variedCtIds[weekShiftIdx % variedCtIds.length];
      const created = await prisma.shift.create({
        data: {
          userId: drGervilla.id,
          patientId,
          start,
          end,
          status,
          observations: i === 0 && wd.offset === 0 ? "Inicio de semana" : "Consulta agendada",
          consultationTypeId: ctId,
        },
      });
      const isFinishedMonTue = isPastDay && wd.offset <= 1;
      weekShiftsCreated.push({ id: created.id, isFinishedMonTue, patientId, isPastDay });
      weekShiftIdx++;
    }
  }
  console.log(`✅ ${weekShiftsCreated.length} week shifts created for bar chart`);

  // ─── Dashboard enrichment: pendientes data ────────────────────────────────
  // The dashboard derives "Evoluciones sin cerrar" from FINISHED shifts in the
  // last 7 days without an attached Evolution. We want EXACTLY 3 to show up,
  // all from Mon/Tue. Backfill evolutions on every other FINISHED week shift.
  const allFinishedWeek = weekShiftsCreated.filter((w) => w.isPastDay);
  const monTueFinished = weekShiftsCreated.filter((w) => w.isFinishedMonTue);
  // Pick the first 3 Mon/Tue shifts to remain "sin cerrar"
  const sinCerrarIds = new Set(monTueFinished.slice(0, 3).map((w) => w.id));
  const toEvolve = allFinishedWeek.filter((w) => !sinCerrarIds.has(w.id));

  // 1) Ensure clinical records exist for all patients in toEvolve (one-time)
  const patientIdsToEvolve = [...new Set(toEvolve.map((w) => w.patientId))];
  const crByPatient = new Map<string, string>();
  for (const pId of patientIdsToEvolve) {
    const cr = await prisma.clinicalRecord.upsert({
      where: { patientId: pId },
      update: {},
      create: { patientId: pId },
    });
    crByPatient.set(pId, cr.id);
  }
  // 2) Bulk-delete prior seed-week evolutions (so re-runs are idempotent)
  await prisma.evolution.deleteMany({
    where: {
      clinicalRecordId: { in: Array.from(crByPatient.values()) },
      notes: { startsWith: "[seed-week-evo]" },
    },
  });
  // 3) Create one evolution per shift in toEvolve
  for (const w of toEvolve) {
    const crId = crByPatient.get(w.patientId);
    if (!crId) continue;
    await prisma.evolution.create({
      data: {
        clinicalRecordId: crId,
        shiftId: w.id,
        userId: drGervilla.id,
        reason: "Control",
        diagnosis: "Evaluación clínica general",
        notes: "[seed-week-evo] Notas de consulta de rutina.",
      },
    });
  }
  console.log(`✅ Evolutions backfilled (3 remain "sin cerrar" for the badge)`);

  // ─── Dashboard enrichment: 5 prescriptions about to expire ────────────────
  const recetaMarker = "[seed-renew]";
  await prisma.prescription.deleteMany({
    where: { userId: drGervilla.id, notes: { startsWith: recetaMarker } },
  });
  // We need 5 prescriptions where (createdAt + durationDays) falls within ±14d
  // from today, so the dashboard count returns exactly 5.
  const expiryPatients = [
    extraPatients["Felipe Moreno"]?.id,
    extraPatients["Isabella Vega"]?.id,
    extraPatients["Florencia Torres"]?.id,
    extraPatients["Mateo Romero"]?.id,
    patients[4].id, // Roberto Fernández
  ].filter(Boolean) as string[];
  for (let i = 0; i < expiryPatients.length; i++) {
    const dur = 90;
    // createdAt so that expiry = today + (i-2) days  ⇒ createdAt = today + (i-2) - 90
    const expiryOffset = i - 2; // -2, -1, 0, +1, +2
    const createdAt = new Date(today);
    createdAt.setDate(createdAt.getDate() + expiryOffset - dur);
    await prisma.prescription.create({
      data: {
        userId: drGervilla.id,
        patientId: expiryPatients[i],
        diagnosis: "Tratamiento crónico",
        durationDays: dur,
        items: JSON.stringify([
          { medication: "Enalapril", dose: "10 mg", frequency: "1 vez al día", duration: "90 días" },
        ]),
        notes: `${recetaMarker} Renovación trimestral`,
        createdAt,
      },
    });
  }
  console.log(`✅ ${expiryPatients.length} prescriptions seeded for renewal`);

  // ─── Dashboard enrichment: 1 pending study order ──────────────────────────
  const studyMarker = "[seed-study]";
  await prisma.studyOrder.deleteMany({
    where: { userId: drGervilla.id, resultNotes: { startsWith: studyMarker } },
  });
  const studyCreatedAt = new Date(today);
  studyCreatedAt.setDate(studyCreatedAt.getDate() - 7);
  await prisma.studyOrder.create({
    data: {
      userId: drGervilla.id,
      patientId: mariaGarcia,
      status: "PENDING",
      items: JSON.stringify([
        { type: "imagen", description: "Holter 24 hs", urgency: "normal" },
      ]),
      resultNotes: `${studyMarker} Holter — pendiente`,
      createdAt: studyCreatedAt,
    },
  });
  console.log(`✅ 1 pending study order seeded for dashboard`);

  // ─── Calendar enrichment: recurring series (3 weekly shifts) ─────────────
  // Same recurrenceGroupId across the series lets the detail dialog show the
  // "Recurrente" badge and allow series cancellation.
  const recurId = `seed-recur-${drGervilla.id.slice(-8)}`;
  await prisma.shift.deleteMany({ where: { recurrenceGroupId: recurId } });

  // First occurrence: next Monday at 11:00.
  const firstRecur = new Date(today);
  const delta = (1 - firstRecur.getDay() + 7) % 7 || 7; // 1=Monday
  firstRecur.setDate(firstRecur.getDate() + delta);
  firstRecur.setHours(11, 0, 0, 0);

  for (let i = 0; i < 3; i++) {
    const start = new Date(firstRecur);
    start.setDate(start.getDate() + i * 7);
    const end = new Date(start.getTime() + 30 * 60_000);
    await prisma.shift.create({
      data: {
        userId: drGervilla.id,
        patientId: patients[7].id, // Diego Torres
        start,
        end,
        status: ShiftStatus.PENDING,
        observations: `Sesión ${i + 1}/3 — Seguimiento semanal post-internación.`,
        consultationTypeId: ct.seguimiento ?? null,
        recurrenceGroupId: recurId,
      },
    });
  }
  console.log(`✅ Recurring series created (3 weekly shifts, group=${recurId})`);

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
    // Cleanup only Pedro's narrative evolutions; preserve seed-week-evo entries
    // that the dashboard backfill relies on (they live alongside).
    await prisma.evolution.deleteMany({
      where: {
        clinicalRecordId: clinicalRecord.id,
        userId: drGervilla.id,
        NOT: { notes: { startsWith: "[seed-week-evo]" } },
      },
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
