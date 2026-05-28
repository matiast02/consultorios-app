import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { toAuditEvent } from "@/lib/audit-mapper";
import type {
  AdminDashboardData,
  AdminStats,
  AdminTrends,
  AuditEvent,
  CatalogHealth,
  TrendMonthPoint,
  TrendTopInsurance,
  TrendTopSpecialty,
  TrendWeekPoint,
  UsersBreakdown,
  RecentLoginItem,
  InactiveUserItem,
} from "@/types";

// ─── Date helpers ────────────────────────────────────────────────────────────

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

function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? 6 : dow - 1; // distance back to Monday
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);
}

function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return round1(((curr - prev) / prev) * 100);
}

// es-AR month abbreviations matching the contract examples ("11 Feb", "Mar 26")
const SHORT_MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function formatDayMonthEs(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS_ES[d.getMonth()]}`;
}

function formatMonthYearEs(d: Date): string {
  return `${SHORT_MONTHS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

// Compute slot count from an HH:mm range divided by a slot duration (minutes)
function slotsForRange(
  from: string | null,
  to: string | null,
  slot: number,
): number {
  if (!from || !to || slot <= 0) return 0;
  const [fH, fM] = from.split(":").map(Number);
  const [tH, tM] = to.split(":").map(Number);
  const minutes = Math.max(0, tH * 60 + tM - (fH * 60 + fM));
  return Math.floor(minutes / slot);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }
    const userId = session.user.id;
    if (!(await isAdmin(userId))) {
      return NextResponse.json(
        { success: false, error: "Solo administradores" },
        { status: 403 },
      );
    }

    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const yesterday = addDays(today, -1);
    const dayOfWeekToday = today.getDay();

    const monthStart = startOfMonth(now);
    const nextMonthStart = addMonths(monthStart, 1);
    const prevMonthStart = addMonths(monthStart, -1);

    const _24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const _48hAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const _7dPrev = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const _30dAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const _90dAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 8-week window: oldest week starts 7 weeks before THIS week's Monday.
    const thisWeekMonday = startOfWeekMonday(today);
    const eightWeekStart = addDays(thisWeekMonday, -7 * 7);
    const eightWeekEnd = addDays(thisWeekMonday, 7); // exclusive

    // 6-month window: oldest = current month - 5 months.
    const sixMonthStart = addMonths(monthStart, -5);

    // ─── Parallel queries ────────────────────────────────────────────────────
    const [
      adminUser,
      totalUsers,
      totalPatients,
      // Stats: shifts buckets
      todayShiftsCount,
      yesterdayShiftsCount,
      todayShiftsUsedRaw,
      // Stats: failed logins
      failedLogins24hCount,
      blockedLogins24hCount,
      failedLogins7dPrevCount,
      // Stats: no-show this month
      monthShifts,
      prevMonthShifts,
      // Stats: occupancy basis — active medics with today's prefs
      activeMedicsToday,
      // Activity feed
      activityFeedRaw,
      // Catalog health
      missingDniCount,
      missingPhoneCount,
      missingOsCount,
      patientsIncompleteTotal,
      medicsWithoutPrefs,
      hiCount,
      hiUsedLast90dGroups,
      specsWithoutColor,
      modules,
      // Trends
      shiftsLast8Weeks,
      shiftsLast6Months,
      shiftsLast30dForSpecialty,
      shiftsLast30dForInsurance,
      // Users
      rolesAll,
      inactiveOrDeletedCount,
      recentLoginsRaw,
      activeMedicsAndStaff,
    ] = await Promise.all([
      // Admin user for header
      prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, name: true },
      }),
      prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      prisma.patient.count({ where: { deletedAt: null } }),
      // today shifts
      prisma.shift.count({ where: { start: { gte: today, lt: tomorrow } } }),
      // yesterday shifts
      prisma.shift.count({ where: { start: { gte: yesterday, lt: today } } }),
      // today used (not cancelled)
      prisma.shift.count({
        where: {
          start: { gte: today, lt: tomorrow },
          status: { not: "CANCELLED" },
        },
      }),
      // failed logins 24h
      prisma.auditLog.count({
        where: { action: "LOGIN_FAILED", createdAt: { gte: _24hAgo } },
      }),
      prisma.auditLog.count({
        where: { action: "LOGIN_BLOCKED", createdAt: { gte: _24hAgo } },
      }),
      // failed logins previous 7d (window [now-8d, now-24h))
      prisma.auditLog.count({
        where: {
          action: "LOGIN_FAILED",
          createdAt: { gte: _7dPrev, lt: _24hAgo },
        },
      }),
      // current month shifts (only consumed buckets)
      prisma.shift.findMany({
        where: {
          start: { gte: monthStart, lt: nextMonthStart },
          status: { in: ["FINISHED", "ABSENT", "CANCELLED"] },
        },
        select: { status: true },
      }),
      // previous month shifts
      prisma.shift.findMany({
        where: {
          start: { gte: prevMonthStart, lt: monthStart },
          status: { in: ["FINISHED", "ABSENT", "CANCELLED"] },
        },
        select: { status: true },
      }),
      // medics active today (for occupancy denominator)
      prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          roles: { some: { role: { name: "medic" } } },
        },
        select: {
          id: true,
          slotDurationMinutes: true,
          preferences: {
            where: { day: dayOfWeekToday },
            select: {
              fromHourAM: true,
              toHourAM: true,
              fromHourPM: true,
              toHourPM: true,
            },
          },
        },
      }),
      // last 20 audit events
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              roles: {
                include: { role: { select: { name: true } } },
                take: 1,
              },
            },
          },
        },
      }),
      // catalog health — patients with missing fields
      prisma.patient.count({
        where: {
          deletedAt: null,
          OR: [{ dni: null }, { dni: "" }],
        },
      }),
      prisma.patient.count({
        where: {
          deletedAt: null,
          OR: [{ telephone: null }, { telephone: "" }],
        },
      }),
      prisma.patient.count({ where: { deletedAt: null, osId: null } }),
      prisma.patient.count({
        where: {
          deletedAt: null,
          OR: [
            { dni: null },
            { dni: "" },
            { telephone: null },
            { telephone: "" },
            { osId: null },
          ],
        },
      }),
      // medics without preferences
      prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          roles: { some: { role: { name: "medic" } } },
          preferences: { none: {} },
        },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
        },
        orderBy: { lastName: "asc" },
      }),
      prisma.healthInsurance.count(),
      // HI used in last 90 days: distinct osId groups appearing in shifts'
      // patients with shift.start in window.
      prisma.shift.groupBy({
        by: ["patientId"],
        where: { start: { gte: _90dAgo } },
      }),
      prisma.specialization.count({ where: { color: null } }),
      prisma.moduleConfig.findMany({
        select: { module: true, name: true, enabled: true },
        orderBy: { module: "asc" },
      }),
      // Trends — shifts last 8 weeks
      prisma.shift.findMany({
        where: {
          start: { gte: eightWeekStart, lt: eightWeekEnd },
          status: { not: "CANCELLED" },
        },
        select: { start: true },
      }),
      // Trends — last 6 months (all consumed-bucket shifts)
      prisma.shift.findMany({
        where: { start: { gte: sixMonthStart, lt: nextMonthStart } },
        select: { start: true, status: true },
      }),
      // Top specialties last 30 days
      prisma.shift.findMany({
        where: { start: { gte: _30dAgo, lt: tomorrow } },
        select: {
          user: {
            select: {
              specializationId: true,
              specialization: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
      }),
      // Top health insurances last 30 days (group by patient.osId)
      prisma.shift.findMany({
        where: { start: { gte: _30dAgo, lt: tomorrow } },
        select: {
          patient: {
            select: {
              osId: true,
              os: { select: { id: true, name: true } },
            },
          },
        },
      }),
      // Users active by role
      prisma.userRole.findMany({
        where: {
          user: { isActive: true, deletedAt: null },
        },
        include: { role: { select: { name: true } } },
      }),
      prisma.user.count({
        where: { OR: [{ isActive: false }, { NOT: { deletedAt: null } }] },
      }),
      // Recent logins (last 5 successful)
      prisma.auditLog.findMany({
        where: { action: "LOGIN_SUCCESS" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              roles: {
                include: { role: { select: { name: true } } },
                take: 1,
              },
            },
          },
        },
      }),
      // All active users — basis for inactive-30d list
      prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      }),
    ]);

    // ─── Header ──────────────────────────────────────────────────────────────
    const adminName =
      [adminUser?.firstName ?? "", adminUser?.lastName ?? ""]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      adminUser?.name ||
      "Admin";

    // ─── todayShifts stat ────────────────────────────────────────────────────
    const todayShifts = {
      value: todayShiftsCount,
      deltaPctVsYesterday: pctDelta(todayShiftsCount, yesterdayShiftsCount),
    };

    // ─── occupancyToday stat ─────────────────────────────────────────────────
    let occupancyTotal = 0;
    for (const m of activeMedicsToday) {
      const slot = m.slotDurationMinutes ?? 30;
      for (const p of m.preferences) {
        occupancyTotal += slotsForRange(p.fromHourAM, p.toHourAM, slot);
        occupancyTotal += slotsForRange(p.fromHourPM, p.toHourPM, slot);
      }
    }
    const occupancyUsed = todayShiftsUsedRaw;
    const occupancyToday = {
      used: occupancyUsed,
      total: occupancyTotal,
      pct:
        occupancyTotal === 0
          ? 0
          : round1((occupancyUsed / occupancyTotal) * 100),
    };

    // ─── failedLogins24h stat ────────────────────────────────────────────────
    const avg7d = failedLogins7dPrevCount / 7;
    const failedLogins24h = {
      value: failedLogins24hCount,
      blockedCount: blockedLogins24hCount,
      deltaPctVs7dAvg:
        avg7d === 0
          ? null
          : round1(((failedLogins24hCount - avg7d) / avg7d) * 100),
    };

    // ─── noShowRateMonth stat ────────────────────────────────────────────────
    const monthTotal = monthShifts.length;
    const monthAbsent = monthShifts.filter((s) => s.status === "ABSENT").length;
    const monthPct =
      monthTotal === 0 ? 0 : round1((monthAbsent / monthTotal) * 100);

    const prevMonthTotal = prevMonthShifts.length;
    const prevMonthAbsent = prevMonthShifts.filter(
      (s) => s.status === "ABSENT",
    ).length;
    const prevMonthPct =
      prevMonthTotal === 0
        ? null
        : round1((prevMonthAbsent / prevMonthTotal) * 100);

    const noShowRateMonth = {
      month: toYearMonth(now),
      pct: monthPct,
      absent: monthAbsent,
      total: monthTotal,
      // Delta in percentage POINTS (not %)
      deltaPctVsPrevMonth:
        prevMonthPct === null ? null : round1(monthPct - prevMonthPct),
    };

    const stats: AdminStats = {
      todayShifts,
      occupancyToday,
      failedLogins24h,
      noShowRateMonth,
    };

    // ─── Activity feed ───────────────────────────────────────────────────────
    const activityFeed: AuditEvent[] = activityFeedRaw.map((row) =>
      toAuditEvent(row),
    );

    // ─── Catalog health ──────────────────────────────────────────────────────
    // healthInsurancesUnused90d: total HI minus those whose id appears as
    // patient.osId for at least one patient who had a shift in the last 90d.
    const patientIdsWithRecentShifts = hiUsedLast90dGroups
      .map((g) => g.patientId)
      .filter(Boolean);
    const recentPatients =
      patientIdsWithRecentShifts.length > 0
        ? await prisma.patient.findMany({
            where: { id: { in: patientIdsWithRecentShifts } },
            select: { osId: true },
          })
        : [];
    const usedHiIds = new Set(
      recentPatients.map((p) => p.osId).filter((x): x is string => !!x),
    );
    const healthInsurancesUnused90dCount = Math.max(0, hiCount - usedHiIds.size);

    const catalogHealth: CatalogHealth = {
      patientsIncomplete: {
        missingDni: missingDniCount,
        missingPhone: missingPhoneCount,
        missingHealthInsurance: missingOsCount,
        total: patientsIncompleteTotal,
      },
      medicsWithoutPreferences: {
        count: medicsWithoutPrefs.length,
        items: medicsWithoutPrefs.slice(0, 5).map((m) => ({
          id: m.id,
          name:
            [m.firstName ?? "", m.lastName ?? ""]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            m.name ||
            "Profesional",
        })),
      },
      healthInsurancesUnused90d: { count: healthInsurancesUnused90dCount },
      specializationsWithoutColor: { count: specsWithoutColor },
      modules: modules.map((m) => ({
        module: m.module,
        name: m.name,
        enabled: m.enabled,
      })),
    };

    // ─── Trends: shiftsByWeek ────────────────────────────────────────────────
    const weekBuckets = new Map<string, number>();
    for (let i = 0; i < 8; i++) {
      const ws = addDays(thisWeekMonday, -7 * (7 - i));
      weekBuckets.set(ws.toISOString().slice(0, 10), 0);
    }
    for (const s of shiftsLast8Weeks) {
      const wsDate = startOfWeekMonday(new Date(s.start));
      const key = wsDate.toISOString().slice(0, 10);
      if (weekBuckets.has(key)) {
        weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + 1);
      }
    }
    const shiftsByWeek: TrendWeekPoint[] = Array.from(weekBuckets.entries())
      .map(([weekStart, count]) => ({
        weekStart,
        label: formatDayMonthEs(new Date(weekStart + "T00:00:00")),
        count,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    // ─── Trends: cancellationByMonth ─────────────────────────────────────────
    const monthBuckets = new Map<
      string,
      { total: number; cancelled: number; absent: number; date: Date }
    >();
    for (let i = 5; i >= 0; i--) {
      const ms = addMonths(monthStart, -i);
      monthBuckets.set(toYearMonth(ms), {
        total: 0,
        cancelled: 0,
        absent: 0,
        date: ms,
      });
    }
    for (const s of shiftsLast6Months) {
      const key = toYearMonth(new Date(s.start));
      const bucket = monthBuckets.get(key);
      if (!bucket) continue;
      bucket.total++;
      if (s.status === "CANCELLED") bucket.cancelled++;
      if (s.status === "ABSENT") bucket.absent++;
    }
    const cancellationByMonth: TrendMonthPoint[] = Array.from(
      monthBuckets.entries(),
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, b]) => ({
        month,
        label: formatMonthYearEs(b.date),
        total: b.total,
        cancelled: b.cancelled,
        absent: b.absent,
        noShowPct:
          b.total === 0
            ? 0
            : round1(((b.absent + b.cancelled) / b.total) * 100),
      }));

    // ─── Trends: topSpecialties last 30d ─────────────────────────────────────
    const specMap = new Map<
      string,
      { id: string | null; name: string; color: string | null; count: number }
    >();
    for (const s of shiftsLast30dForSpecialty) {
      const spec = s.user?.specialization ?? null;
      const key = spec?.id ?? "__none__";
      const existing = specMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        specMap.set(key, {
          id: spec?.id ?? null,
          name: spec?.name ?? "Sin especialidad",
          color: spec?.color ?? null,
          count: 1,
        });
      }
    }
    const topSpecialties: TrendTopSpecialty[] = Array.from(specMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ─── Trends: topHealthInsurances last 30d ────────────────────────────────
    const hiMap = new Map<
      string,
      { id: string | null; name: string; count: number }
    >();
    for (const s of shiftsLast30dForInsurance) {
      const os = s.patient?.os ?? null;
      const osId = s.patient?.osId ?? null;
      const key = osId ?? "__none__";
      const existing = hiMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        hiMap.set(key, {
          id: osId,
          name: os?.name ?? "Sin obra social",
          count: 1,
        });
      }
    }
    const topHealthInsurances: TrendTopInsurance[] = Array.from(hiMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const trends: AdminTrends = {
      shiftsByWeek,
      cancellationByMonth,
      topSpecialties,
      topHealthInsurances,
    };

    // ─── Users breakdown ─────────────────────────────────────────────────────
    let medicCount = 0;
    let secretaryCount = 0;
    let adminCount = 0;
    // A user can have multiple roles — count distinct user ids per role.
    const seenByRole: Record<string, Set<string>> = {
      medic: new Set(),
      secretary: new Set(),
      admin: new Set(),
    };
    for (const ur of rolesAll) {
      const name = ur.role.name;
      if (name === "medic" || name === "secretary" || name === "admin") {
        seenByRole[name].add(ur.userId);
      }
    }
    medicCount = seenByRole.medic.size;
    secretaryCount = seenByRole.secretary.size;
    adminCount = seenByRole.admin.size;

    const recentLogins: RecentLoginItem[] = recentLoginsRaw.map((r) => {
      const name =
        [r.user?.firstName ?? "", r.user?.lastName ?? ""]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        r.user?.name ||
        "Usuario";
      return {
        userId: r.userId,
        name,
        role: r.user?.roles?.[0]?.role?.name ?? null,
        loggedAt: r.createdAt.toISOString(),
        ipAddress: r.ipAddress,
      };
    });

    // Inactive 30d: users with no LOGIN_SUCCESS in last 30 days
    const activeUserIds = activeMedicsAndStaff.map((u) => u.id);
    const recentLoginUsers =
      activeUserIds.length > 0
        ? await prisma.auditLog.groupBy({
            by: ["userId"],
            where: {
              action: "LOGIN_SUCCESS",
              createdAt: { gte: _30dAgo },
              userId: { in: activeUserIds },
            },
          })
        : [];
    const userIdsWithRecentLogin = new Set(
      recentLoginUsers.map((g) => g.userId),
    );
    const inactiveUsers = activeMedicsAndStaff.filter(
      (u) => !userIdsWithRecentLogin.has(u.id),
    );

    // Compute lastLoginAt for first 5 inactive users
    const firstInactive = inactiveUsers.slice(0, 5);
    const lastLoginsByUser = new Map<string, Date | null>();
    if (firstInactive.length > 0) {
      const lasts = await prisma.auditLog.groupBy({
        by: ["userId"],
        where: {
          action: "LOGIN_SUCCESS",
          userId: { in: firstInactive.map((u) => u.id) },
        },
        _max: { createdAt: true },
      });
      for (const l of lasts) {
        lastLoginsByUser.set(l.userId, l._max.createdAt ?? null);
      }
    }
    const inactiveItems: InactiveUserItem[] = firstInactive.map((u) => ({
      id: u.id,
      name:
        [u.firstName ?? "", u.lastName ?? ""].filter(Boolean).join(" ").trim() ||
        u.name ||
        "Usuario",
      lastLoginAt: lastLoginsByUser.get(u.id)?.toISOString() ?? null,
    }));

    const users: UsersBreakdown = {
      activeByRole: {
        medic: medicCount,
        secretary: secretaryCount,
        admin: adminCount,
        inactive: inactiveOrDeletedCount,
      },
      recentLogins,
      inactiveUsers30d: {
        count: inactiveUsers.length,
        items: inactiveItems,
      },
    };

    const data: AdminDashboardData = {
      header: {
        adminName,
        now: now.toISOString(),
        totalUsers,
        totalPatients,
      },
      stats,
      activityFeed,
      catalogHealth,
      trends,
      users,
    };

    // Fire-and-forget audit log for accessing the admin dashboard.
    // `resource` "admin_dashboard" is outside the typed AuditResource union,
    // so we cast through `as never` (same pattern as prescription endpoints).
    logAudit({
      userId,
      action: "VIEW_SENSITIVE",
      resource: "admin_dashboard" as never,
      resourceId: "dashboard",
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/dashboard/admin error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener dashboard admin" },
      { status: 500 },
    );
  }
}
