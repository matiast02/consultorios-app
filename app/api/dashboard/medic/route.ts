import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMedic } from "@/lib/auth-utils";

const DAY_LABELS = ["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"] as const;
const RENEWAL_WINDOW_DAYS = 14;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date, weekStartDay = 1): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0..6 (Sunday=0)
  const offset = (day - weekStartDay + 7) % 7;
  x.setDate(x.getDate() - offset);
  return x;
}

function endOfWeek(weekStart: Date): Date {
  const x = new Date(weekStart);
  x.setDate(x.getDate() + 7);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getInitials(firstName: string, lastName: string): string {
  return `${(firstName[0] ?? "").toUpperCase()}${(lastName[0] ?? "").toUpperCase()}`;
}

function summarizeDays(dates: Date[]): string {
  if (dates.length === 0) return "";
  const dayLong = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const unique = [...new Set(dates.map((d) => dayLong[d.getDay()]))];
  if (unique.length === 1) return `Del ${unique[0]}`;
  if (unique.length === 2) return `De los turnos del ${unique[0]} y ${unique[1]}`;
  const last = unique.pop();
  return `De los turnos del ${unique.join(", ")} y ${last}`;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    if (!(await isMedic(userId))) {
      return NextResponse.json({ success: false, error: "Solo médicos pueden acceder" }, { status: 403 });
    }

    const now = new Date();
    const today = startOfDay(now);
    const weekStart = startOfWeek(today, 1);
    const weekEnd = endOfWeek(weekStart);
    const renewalLimit = addDays(today, RENEWAL_WINDOW_DAYS);
    const recentWindowStart = addDays(today, -30);

    const [
      todayShifts,
      weekShifts,
      finishedRecentWithEvolution,
      prescriptionsForRenewal,
      pendingStudyOrders,
      recentShiftsForPatients,
    ] = await Promise.all([
      // Today's shifts (with patient, OS, type)
      prisma.shift.findMany({
        where: { userId, start: { gte: today, lt: addDays(today, 1) } },
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
        },
        orderBy: { start: "asc" },
      }),

      // Week shifts grouped by day
      prisma.shift.groupBy({
        by: ["start"],
        where: { userId, start: { gte: weekStart, lt: weekEnd } },
        _count: { id: true },
      }),

      // Finished shifts in last 30 days that DO have an evolution → so we can
      // subtract from total finished to find "sin cerrar"
      prisma.shift.findMany({
        where: {
          userId,
          status: "FINISHED",
          start: { gte: recentWindowStart, lt: today },
          evolution: { isNot: null },
        },
        select: { id: true, start: true },
      }),

      // Prescriptions where (createdAt + durationDays days) ∈ [today, today + RENEWAL_WINDOW_DAYS]
      // SQL filter is approximate via raw query is overkill; pull recent and filter in code.
      prisma.prescription.findMany({
        where: {
          userId,
          createdAt: { gte: addDays(today, -180) },
        },
        select: { id: true, createdAt: true, durationDays: true, patientId: true },
      }),

      // Pending study orders
      prisma.studyOrder.findMany({
        where: { userId, status: "PENDING" },
        include: {
          patient: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      }),

      // Recent patients: latest past shifts from this medic
      prisma.shift.findMany({
        where: { userId, status: "FINISHED" },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          consultationType: { select: { name: true } },
        },
        orderBy: { start: "desc" },
        take: 30,
      }),
    ]);

    // ─── Today stats ────────────────────────────────────────────────────────
    let atendidos = 0, ausentes = 0, confirmados = 0, pendientes = 0, porVenir = 0;
    for (const s of todayShifts) {
      if (s.status === "FINISHED") atendidos++;
      else if (s.status === "ABSENT") ausentes++;
      if (s.status === "CONFIRMED") confirmados++;
      if (s.status === "PENDING") pendientes++;
      if (s.status === "PENDING" || s.status === "CONFIRMED") {
        porVenir++;
      }
    }

    // ─── Next shift today ────────────────────────────────────────────────────
    const nextShift = todayShifts.find(
      (s) => (s.status === "PENDING" || s.status === "CONFIRMED") && new Date(s.start) > now,
    ) ?? null;

    const mapShift = (s: typeof todayShifts[number]) => {
      const start = new Date(s.start);
      const end = new Date(s.end);
      const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      return {
        id: s.id,
        start: start.toISOString(),
        end: end.toISOString(),
        status: s.status,
        observations: s.observations,
        isOverbook: s.isOverbook,
        durationMinutes,
        patient: s.patient
          ? {
              id: s.patient.id,
              firstName: s.patient.firstName,
              lastName: s.patient.lastName,
              telephone: s.patient.telephone,
              os: s.patient.os,
            }
          : null,
        consultationType: s.consultationType,
      };
    };

    // ─── Week bar chart ──────────────────────────────────────────────────────
    const dayCounts: Record<number, number> = {};
    for (const w of weekShifts) {
      const d = startOfDay(new Date(w.start)).getTime();
      dayCounts[d] = (dayCounts[d] ?? 0) + w._count.id;
    }
    const byDay = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return {
        date: date.toISOString(),
        count: dayCounts[startOfDay(date).getTime()] ?? 0,
        dayLabel: DAY_LABELS[i],
        dayNumber: date.getDate(),
        isToday: isSameDay(date, today),
      };
    });
    const totalWeekShifts = byDay.reduce((acc, d) => acc + d.count, 0);

    // ─── Pendientes ──────────────────────────────────────────────────────────
    // Evoluciones sin cerrar: count FINISHED shifts in last 7d without evolution
    const last7Start = addDays(today, -7);
    const finishedLast7 = await prisma.shift.findMany({
      where: {
        userId,
        status: "FINISHED",
        start: { gte: last7Start, lt: today },
      },
      select: { id: true, start: true, evolution: { select: { id: true } } },
    });
    const sinCerrar = finishedLast7.filter((s) => !s.evolution);
    const sinCerrarDates = sinCerrar.map((s) => new Date(s.start));

    // Recetas para renovar: recién vencidas (últimos 7d) + por vencer en RENEWAL_WINDOW_DAYS
    const renewalLowerBound = addDays(today, -7);
    const renewalCount = prescriptionsForRenewal.filter((p) => {
      const expiry = addDays(new Date(p.createdAt), p.durationDays ?? 90);
      return expiry >= renewalLowerBound && expiry <= renewalLimit;
    }).length;

    // Estudios pendientes
    const oldestStudy = pendingStudyOrders[pendingStudyOrders.length - 1] ?? null;
    let studySummary = "Sin estudios";
    if (pendingStudyOrders.length > 0 && oldestStudy) {
      try {
        const items = JSON.parse(oldestStudy.items) as Array<{ description?: string }>;
        const firstDesc = items[0]?.description?.split(/\s/)[0] ?? "Estudio";
        const firstInitial = (oldestStudy.patient?.firstName?.[0] ?? "").toUpperCase();
        const lastName = oldestStudy.patient?.lastName ?? "";
        const dueDate = addDays(new Date(oldestStudy.createdAt), 14);
        const dueDateStr = `${String(dueDate.getDate()).padStart(2, "0")}/${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
        studySummary = `${firstDesc} — ${firstInitial}. ${lastName} · vence ${dueDateStr}`;
      } catch {
        studySummary = "Estudio pendiente";
      }
    }

    // Avoid unused warning for finishedRecentWithEvolution
    void finishedRecentWithEvolution;

    // ─── Recent patients ─────────────────────────────────────────────────────
    const seenPatientIds = new Set<string>();
    const recentPatients: Array<{
      id: string;
      firstName: string;
      lastName: string;
      initials: string;
      lastShiftType: string | null;
      lastShiftTime: string;
    }> = [];
    for (const s of recentShiftsForPatients) {
      if (!s.patient) continue;
      if (seenPatientIds.has(s.patient.id)) continue;
      // Only past shifts (already happened)
      if (new Date(s.start) > now) continue;
      seenPatientIds.add(s.patient.id);
      recentPatients.push({
        id: s.patient.id,
        firstName: s.patient.firstName,
        lastName: s.patient.lastName,
        initials: getInitials(s.patient.firstName, s.patient.lastName),
        lastShiftType: s.consultationType?.name ?? null,
        lastShiftTime: new Date(s.start).toISOString(),
      });
      if (recentPatients.length >= 5) break;
    }

    return NextResponse.json({
      success: true,
      data: {
        today: {
          date: today.toISOString(),
          shifts: todayShifts.map(mapShift),
          nextShift: nextShift ? mapShift(nextShift) : null,
          stats: {
            total: todayShifts.length,
            atendidos,
            porVenir,
            confirmados,
            ausentes,
            pendientes,
          },
        },
        week: {
          totalShifts: totalWeekShifts,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
          byDay,
        },
        pendientes: {
          evolucionesSinCerrar: {
            count: sinCerrar.length,
            summary: sinCerrar.length === 0
              ? "Todo al día"
              : summarizeDays(sinCerrarDates) || `Últimos ${sinCerrar.length} turnos`,
          },
          recetasParaRenovar: {
            count: renewalCount,
            summary: renewalCount === 0 ? "Sin renovaciones pendientes" : "Pacientes crónicos · esta semana",
          },
          estudiosPendientes: {
            count: pendingStudyOrders.length,
            summary: studySummary,
          },
        },
        recentPatients,
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard/medic error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener dashboard" }, { status: 500 });
  }
}
