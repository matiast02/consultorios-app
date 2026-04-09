import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMedic } from "@/lib/auth-utils";

interface ComputedNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceId: string | null;
  read: boolean;
  createdAt: string;
}

// GET /api/notifications — Compute on-demand notifications for the current user
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const userId = session.user.id!;
    const userIsMedic = await isMedic(userId);
    const now = new Date();
    const notifications: ComputedNotification[] = [];

    // Run all queries in parallel
    const [rescheduledShifts, pendingStudies, inactivePatients, todayShifts] =
      await Promise.all([
        // a) Turnos reprogramados (last 48h)
        getRescheduledShifts(userId, userIsMedic, now),
        // b) Estudios pendientes
        getPendingStudies(userId, userIsMedic),
        // c) Pacientes inactivos (last shift > 90 days ago)
        getInactivePatients(userId, userIsMedic, now),
        // d) Resumen del dia
        getTodayShifts(userId, userIsMedic, now),
      ]);

    // Build daily summary notification
    if (todayShifts.total > 0) {
      const firstShift = todayShifts.firstStart;
      const timeStr = firstShift
        ? firstShift.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "";
      notifications.push({
        id: "generated-daily-summary",
        type: "daily_summary",
        title: "Turnos de hoy",
        message: `Tienes ${todayShifts.total} turno${todayShifts.total !== 1 ? "s" : ""} hoy${timeStr ? `. Primero a las ${timeStr}` : ""}. ${todayShifts.pending} pendiente${todayShifts.pending !== 1 ? "s" : ""}, ${todayShifts.confirmed} confirmado${todayShifts.confirmed !== 1 ? "s" : ""}.`,
        resourceId: null,
        read: false,
        createdAt: now.toISOString(),
      });
    }

    // Build pending studies notification
    if (pendingStudies > 0) {
      notifications.push({
        id: "generated-pending-studies",
        type: "pending_studies",
        title: "Estudios pendientes",
        message: `${pendingStudies} ${pendingStudies === 1 ? "orden de estudio esperando" : "ordenes de estudios esperando"} resultados`,
        resourceId: null,
        read: false,
        createdAt: now.toISOString(),
      });
    }

    // Build rescheduled shifts notifications
    for (const shift of rescheduledShifts) {
      const patientName = `${shift.patient.lastName}, ${shift.patient.firstName}`;
      const newDate = shift.start.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
      });
      const newTime = shift.start.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      notifications.push({
        id: `generated-rescheduled-${shift.id}`,
        type: "rescheduled",
        title: "Turno reprogramado",
        message: `${patientName} fue reprogramado al ${newDate} a las ${newTime}`,
        resourceId: shift.id,
        read: false,
        createdAt: (shift.rescheduledAt ?? shift.updatedAt).toISOString(),
      });
    }

    // Build inactive patients notifications
    for (const patient of inactivePatients) {
      const patientName = `${patient.lastName}, ${patient.firstName}`;
      const lastDate = patient.lastShiftDate;
      const daysSince = Math.floor(
        (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      notifications.push({
        id: `generated-inactive-${patient.id}`,
        type: "inactive_patient",
        title: "Paciente inactivo",
        message: `${patientName} no tiene turnos hace ${daysSince} dias`,
        resourceId: patient.id,
        read: false,
        createdAt: now.toISOString(),
      });
    }

    // Sort: daily_summary first, then by createdAt desc
    notifications.sort((a, b) => {
      if (a.type === "daily_summary") return -1;
      if (b.type === "daily_summary") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        count: notifications.length,
      },
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener notificaciones" },
      { status: 500 }
    );
  }
}

// ─── Helper functions ─────────────────────────────────────────────────────────

async function getRescheduledShifts(
  userId: string,
  userIsMedic: boolean,
  now: Date
) {
  const since = new Date(now);
  since.setHours(since.getHours() - 48);

  const where: Record<string, unknown> = {
    rescheduledAt: { gte: since },
    rescheduledFrom: { not: null },
    status: { notIn: ["CANCELLED"] },
  };

  if (userIsMedic) {
    where.userId = userId;
  }

  return prisma.shift.findMany({
    where,
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { rescheduledAt: "desc" },
    take: 10,
  });
}

async function getPendingStudies(userId: string, userIsMedic: boolean) {
  const where: Record<string, unknown> = {
    status: "PENDING",
  };

  if (userIsMedic) {
    where.userId = userId;
  }

  return prisma.studyOrder.count({ where });
}

async function getTodayShifts(
  userId: string,
  userIsMedic: boolean,
  now: Date
) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const where: Record<string, unknown> = {
    start: { gte: startOfDay, lte: endOfDay },
    status: { notIn: ["CANCELLED"] },
  };

  if (userIsMedic) {
    where.userId = userId;
  }

  const shifts = await prisma.shift.findMany({
    where,
    select: { status: true, start: true },
    orderBy: { start: "asc" },
  });

  return {
    total: shifts.length,
    pending: shifts.filter((s) => s.status === "PENDING").length,
    confirmed: shifts.filter((s) => s.status === "CONFIRMED").length,
    firstStart: shifts.length > 0 ? shifts[0].start : null,
  };
}

async function getInactivePatients(
  userId: string,
  userIsMedic: boolean,
  now: Date
) {
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Find patients whose last FINISHED shift was > 90 days ago
  // For medics, only their own patients (via shifts)
  const medicFilter = userIsMedic ? `AND s.userId = '${userId}'` : "";

  // Use raw query for this complex aggregation
  const results: Array<{
    id: string;
    firstName: string;
    lastName: string;
    lastShiftDate: Date;
  }> = await prisma.$queryRawUnsafe(`
    SELECT p.id, p.firstName, p.lastName, MAX(s.start) as lastShiftDate
    FROM Patient p
    INNER JOIN Shift s ON s.patientId = p.id
    WHERE s.status = 'FINISHED'
      AND p.deletedAt IS NULL
      ${medicFilter}
    GROUP BY p.id, p.firstName, p.lastName
    HAVING MAX(s.start) < ?
    ORDER BY MAX(s.start) ASC
    LIMIT 5
  `, ninetyDaysAgo);

  return results;
}
