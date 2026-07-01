import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import type {
  AgendaAutoMode,
  AgendaProfessional,
  AgendaShiftMini,
  MedicSlotsGroup,
  NextToCallData,
  ReminderItem,
  SecretaryAgendaData,
  SecretaryDashboardData,
  SecretaryRemindersData,
  WaitingRoomItem,
} from "@/types";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function diffMinutes(a: Date, b: Date): number {
  return Math.max(0, Math.round((a.getTime() - b.getTime()) / 60000));
}

function shortMedicName(u: { firstName: string | null; lastName: string | null; name: string | null }): string {
  // Try to infer gender from firstName ending (es-AR): "a" → Dra., else Dr.
  const fn = u.firstName?.trim() ?? "";
  const ln = u.lastName?.trim() ?? "";
  const honor = fn.toLowerCase().endsWith("a") ? "Dra." : "Dr.";
  if (ln) return `${honor} ${ln}`;
  if (fn) return `${honor} ${fn}`;
  return u.name ?? "Profesional";
}

function osShortFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const up = name.toUpperCase();
  if (up.includes("SWISS")) return "SWISS";
  if (up.includes("PARTICULAR")) return "PART";
  if (up.includes("MEDIF")) return "MEDIFE";
  if (up.includes("UNI")) return "UNIÓN";
  if (up.includes("OSDE")) return "OSDE";
  if (up.includes("IOMA")) return "IOMA";
  if (up.includes("PAMI")) return "PAMI";
  if (up.includes("GALENO")) return "GALENO";
  // First 6 chars uppercase otherwise
  return up.split(/\s+/)[0].slice(0, 6);
}

function pickAutoMode(activeCount: number): AgendaAutoMode {
  if (activeCount <= 2) return "columns-detailed";
  if (activeCount <= 5) return "columns-compact";
  return "rails";
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    if (!(await isSecretaryOrAdmin(userId))) {
      return NextResponse.json({ success: false, error: "Solo recepción puede acceder" }, { status: 403 });
    }

    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const dayAfter = addDays(today, 2);
    const dayOfWeek = today.getDay();
    const tomorrowDow = tomorrow.getDay();

    const [
      secretaryUser,
      todayShifts,
      tomorrowReminders,
      activeMedics,
      todayPrefs,
      todayBlockDays,
      walkIns,
    ] = await Promise.all([
      // Secretary name
      prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, name: true },
      }),

      // Today's shifts (all medics) with patient, OS, type, medic info
      prisma.shift.findMany({
        where: { start: { gte: today, lt: tomorrow } },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              telephone: true,
              os: { select: { id: true, name: true, code: true } },
            },
          },
          consultationType: { select: { id: true, name: true, color: true } },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              name: true,
              defaultRoom: true,
              specialization: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: { start: "asc" },
      }),

      // Reminders scheduled for tomorrow's shifts (regardless of status — we list all)
      prisma.shiftReminder.findMany({
        where: { scheduledFor: { gte: tomorrow, lt: dayAfter } },
        include: {
          shift: {
            include: {
              patient: { select: { firstName: true, lastName: true } },
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  name: true,
                  specialization: { select: { color: true } },
                },
              },
            },
          },
        },
        orderBy: { scheduledFor: "asc" },
      }),

      // Active professionals: medics that are isActive AND have at least one shift today OR a preference covering today
      prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          roles: { some: { role: { name: "medic" } } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          defaultRoom: true,
          slotDurationMinutes: true,
          specialization: { select: { id: true, name: true, color: true } },
          preferences: {
            where: { day: dayOfWeek },
            select: { fromHourAM: true, toHourAM: true, fromHourPM: true, toHourPM: true },
          },
          shifts: {
            where: { start: { gte: today, lt: tomorrow } },
            select: { id: true },
          },
        },
      }),

      // All user preferences for today's day-of-week, so we can compute slots
      prisma.userPreference.findMany({ where: { day: dayOfWeek } }),

      // Today's block days
      prisma.blockDay.findMany({ where: { date: { gte: today, lt: tomorrow } } }),

      // Today's walk-ins still in waiting room
      prisma.walkInArrival.findMany({
        where: {
          arrivedAt: { gte: today, lt: tomorrow },
          leftAt: null,
          assignedShiftId: null,
        },
        orderBy: { arrivedAt: "asc" },
      }),
    ]);

    // ─── Active professionals for today ────────────────────────────────────
    const todayActive = activeMedics.filter(
      (m) => m.shifts.length > 0 || m.preferences.length > 0,
    );

    // ─── Today stats ───────────────────────────────────────────────────────
    let enConsulta = 0;
    let enSala = 0;
    let esperandoMas15 = 0;

    const scheduledWaitingItems: WaitingRoomItem[] = [];
    for (const s of todayShifts) {
      if (s.consultationStartedAt && !["FINISHED", "ABSENT", "CANCELLED"].includes(s.status)) {
        // Pacient still in consultation
        enConsulta++;
        continue;
      }
      if (
        s.arrivedAt &&
        !s.consultationStartedAt &&
        !["FINISHED", "ABSENT", "CANCELLED"].includes(s.status)
      ) {
        enSala++;
        const min = diffMinutes(now, new Date(s.arrivedAt));
        if (min > 15) esperandoMas15++;

        scheduledWaitingItems.push({
          id: s.id,
          kind: "scheduled",
          arrivedAt: new Date(s.arrivedAt).toISOString(),
          minutesWaiting: min,
          isNext: false,
          note: s.observations ?? null,
          patient: {
            id: s.patient?.id ?? null,
            firstName: s.patient?.firstName ?? "",
            lastName: s.patient?.lastName ?? "",
            telephone: s.patient?.telephone ?? null,
            osShort: osShortFromName(s.patient?.os?.name),
          },
          shift: {
            id: s.id,
            start: new Date(s.start).toISOString(),
            durationMinutes: Math.max(
              0,
              Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000),
            ),
            medicId: s.userId,
            medicShortName: shortMedicName(s.user),
            medicColor: s.user.specialization?.color ?? null,
            consultationTypeName: s.consultationType?.name ?? null,
          },
        });
      }
    }

    // Walk-in items
    const walkInWaitingItems: WaitingRoomItem[] = walkIns.map((w) => {
      const min = diffMinutes(now, new Date(w.arrivedAt));
      if (min > 15) esperandoMas15++;
      enSala++;
      return {
        id: w.id,
        kind: "walkin",
        arrivedAt: new Date(w.arrivedAt).toISOString(),
        minutesWaiting: min,
        isNext: false,
        note: w.note ?? null,
        patient: {
          id: w.patientId,
          firstName: w.firstName,
          lastName: w.lastName,
          telephone: w.telephone ?? null,
          osShort: null,
        },
        shift: null,
      };
    });

    // Sort everyone by arrivedAt desc (most recent first to feel "live"),
    // but actually the design shows the LONGEST waiting first.
    const salaDeEspera = [...scheduledWaitingItems, ...walkInWaitingItems].sort(
      (a, b) => b.minutesWaiting - a.minutesWaiting,
    );

    // Mark next-to-call: scheduled patient with earliest start time among those in waiting room
    const nextToCallShift = scheduledWaitingItems
      .slice()
      .sort((a, b) => new Date(a.shift!.start).getTime() - new Date(b.shift!.start).getTime())[0];
    if (nextToCallShift) {
      const item = salaDeEspera.find((x) => x.id === nextToCallShift.id);
      if (item) item.isNext = true;
    }

    // ─── Próximo a llamar ────────────────────────────────────────────────────
    let proximoALlamar: NextToCallData | null = null;
    if (nextToCallShift) {
      const sourceShift = todayShifts.find((s) => s.id === nextToCallShift.id)!;
      proximoALlamar = {
        waitingRoomId: nextToCallShift.id,
        kind: "scheduled",
        patient: {
          firstName: sourceShift.patient?.firstName ?? "",
          lastName: sourceShift.patient?.lastName ?? "",
        },
        medicShortName: shortMedicName(sourceShift.user),
        medicColor: sourceShift.user.specialization?.color ?? null,
        room: sourceShift.user.defaultRoom ?? null,
        shiftStart: new Date(sourceShift.start).toISOString(),
        minutesWaiting: nextToCallShift.minutesWaiting,
      };
    }

    // ─── Recordatorios ───────────────────────────────────────────────────────
    const reminderItems: ReminderItem[] = tomorrowReminders.map((r) => {
      const time = formatHHmm(new Date(r.shift.start));
      const lastName = r.shift.patient?.lastName ?? "";
      const firstInitial = (r.shift.patient?.firstName?.[0] ?? "").toUpperCase();
      const patientShortName = lastName
        ? `${lastName}, ${(r.shift.patient?.firstName ?? "").trim().split(/\s+/)[0]}`
        : "Paciente";
      void firstInitial;
      return {
        id: r.id,
        shiftId: r.shiftId,
        time,
        patientShortName,
        medicShortName: shortMedicName(r.shift.user),
        medicColor: r.shift.user.specialization?.color ?? null,
        status: r.status,
      };
    });

    const pending = reminderItems.filter((x) => x.status === "PENDING").length;
    const sent = reminderItems.filter((x) => x.status === "SENT").length;

    const recordatorios: SecretaryRemindersData = {
      context: "tomorrow",
      total: reminderItems.length,
      pending,
      sent,
      items: reminderItems,
    };

    // ─── Huecos hoy (slots libres por médico) ────────────────────────────────
    // For each active medic with a preference today, compute free slots
    function generateMedicSlots(
      pref: { fromHourAM: string | null; toHourAM: string | null; fromHourPM: string | null; toHourPM: string | null },
      duration: number,
      shiftsToday: Array<{ start: Date; end: Date }>,
    ): Array<{ time: string; durationMinutes: number }> {
      const out: Array<{ time: string; durationMinutes: number }> = [];
      function gen(fromHour: string | null, toHour: string | null) {
        if (!fromHour || !toHour) return;
        const [fH, fM] = fromHour.split(":").map(Number);
        const [tH, tM] = toHour.split(":").map(Number);
        const startMin = fH * 60 + fM;
        const endMin = tH * 60 + tM;
        for (let min = startMin; min + duration <= endMin; min += duration) {
          const slotStartH = Math.floor(min / 60);
          const slotStartM = min % 60;
          const slotEndMin = min + duration;
          const slotEndH = Math.floor(slotEndMin / 60);
          const slotEndM = slotEndMin % 60;
          const slotStart = new Date(today);
          slotStart.setHours(slotStartH, slotStartM, 0, 0);
          const slotEnd = new Date(today);
          slotEnd.setHours(slotEndH, slotEndM, 0, 0);
          // Skip slots whose start time is already in the past
          if (slotStart <= now) continue;
          const isOccupied = shiftsToday.some(
            (s) => s.start < slotEnd && s.end > slotStart,
          );
          if (!isOccupied) {
            out.push({
              time: `${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}`,
              durationMinutes: duration,
            });
          }
        }
      }
      gen(pref.fromHourAM, pref.toHourAM);
      gen(pref.fromHourPM, pref.toHourPM);
      return out;
    }

    const shiftsByMedic = new Map<string, Array<{ start: Date; end: Date }>>();
    for (const s of todayShifts) {
      if (s.status === "CANCELLED") continue;
      const list = shiftsByMedic.get(s.userId) ?? [];
      list.push({ start: new Date(s.start), end: new Date(s.end) });
      shiftsByMedic.set(s.userId, list);
    }

    const blockedMedicIds = new Set(todayBlockDays.map((b) => b.userId));
    const huecosHoy: MedicSlotsGroup[] = [];
    let totalHuecos = 0;
    for (const m of todayActive) {
      if (blockedMedicIds.has(m.id)) continue;
      const pref = todayPrefs.find((p) => p.userId === m.id);
      if (!pref) continue;
      const slots = generateMedicSlots(
        {
          fromHourAM: pref.fromHourAM,
          toHourAM: pref.toHourAM,
          fromHourPM: pref.fromHourPM,
          toHourPM: pref.toHourPM,
        },
        m.slotDurationMinutes ?? 30,
        shiftsByMedic.get(m.id) ?? [],
      );
      if (slots.length === 0) continue;
      totalHuecos += slots.length;
      huecosHoy.push({
        medicId: m.id,
        medicShortName: shortMedicName(m),
        dotColor: m.specialization?.color ?? null,
        count: slots.length,
        slots,
      });
    }
    // Sort by first-available slot time
    huecosHoy.sort((a, b) => (a.slots[0]?.time ?? "").localeCompare(b.slots[0]?.time ?? ""));

    // ─── Agenda data ─────────────────────────────────────────────────────────
    const profesionales: AgendaProfessional[] = todayActive.map((m) => {
      const pref = todayPrefs.find((p) => p.userId === m.id);
      const segments: Array<"AM" | "PM"> = [];
      if (pref?.fromHourAM && pref?.toHourAM) segments.push("AM");
      if (pref?.fromHourPM && pref?.toHourPM) segments.push("PM");

      const medicShifts: AgendaShiftMini[] = todayShifts
        .filter((s) => s.userId === m.id)
        .map((s) => {
          const lastName = s.patient?.lastName ?? "";
          const firstInitial = (s.patient?.firstName?.[0] ?? "").toUpperCase();
          return {
            id: s.id,
            start: new Date(s.start).toISOString(),
            end: new Date(s.end).toISOString(),
            status: s.status,
            patientShortName: lastName ? `${lastName}, ${firstInitial}.` : "Paciente",
            consultationTypeName: s.consultationType?.name ?? null,
            isWalkIn: s.isOverbook,
          };
        });

      return {
        id: m.id,
        shortName: shortMedicName(m),
        especialidad: m.specialization?.name ?? null,
        room: m.defaultRoom ?? null,
        dotColor: m.specialization?.color ?? null,
        isPinned: false,
        turnSegments: segments,
        hasWaitingPatients: scheduledWaitingItems.some((w) => w.shift?.medicId === m.id),
        hasFreeSlots: huecosHoy.some((h) => h.medicId === m.id),
        shifts: medicShifts,
      };
    });

    const totalShifts = todayShifts.length;
    const agenda: SecretaryAgendaData = {
      autoMode: pickAutoMode(todayActive.length),
      profesionales,
      totalShifts,
    };

    // ─── Header ──────────────────────────────────────────────────────────────
    const fullName =
      [secretaryUser?.firstName ?? "", secretaryUser?.lastName ?? ""].filter(Boolean).join(" ").trim() ||
      secretaryUser?.name ||
      "Recepción";

    const payload: SecretaryDashboardData = {
      header: {
        secretaryName: fullName,
        now: now.toISOString(),
        activeProfessionalsCount: todayActive.length,
      },
      stats: {
        enSalaDeEspera: enSala,
        enConsulta,
        esperandoMas15,
        huecosHoy: totalHuecos,
      },
      salaDeEspera,
      proximoALlamar,
      recordatorios,
      huecosHoy,
      agenda,
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    console.error("GET /api/dashboard/secretary error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener dashboard" },
      { status: 500 },
    );
  }
}
