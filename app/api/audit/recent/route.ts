import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";
import { toAuditEvent } from "@/lib/audit-mapper";
import type { AuditEvent, AuditRecentResponse } from "@/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseCsv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export async function GET(req: NextRequest) {
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

    const { searchParams } = req.nextUrl;

    const actions = parseCsv(searchParams.get("action"));
    const resources = parseCsv(searchParams.get("resource"));
    const filterUserId = searchParams.get("userId") ?? undefined;
    const beforeRaw = searchParams.get("before");
    const limitRaw = searchParams.get("limit");

    let limit = DEFAULT_LIMIT;
    if (limitRaw) {
      const n = Number.parseInt(limitRaw, 10);
      if (Number.isFinite(n) && n >= 1) {
        limit = Math.min(MAX_LIMIT, n);
      }
    }

    let before: Date | undefined;
    if (beforeRaw) {
      const d = new Date(beforeRaw);
      if (!Number.isNaN(d.getTime())) before = d;
    }

    const where: Record<string, unknown> = {};
    if (actions) where.action = { in: actions };
    if (resources) where.resource = { in: resources };
    if (filterUserId) where.userId = filterUserId;
    if (before) where.createdAt = { lt: before };

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
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
    });

    const items: AuditEvent[] = rows.map((r) => toAuditEvent(r));
    const nextCursor =
      rows.length < limit ? null : rows[rows.length - 1].createdAt.toISOString();

    const data: AuditRecentResponse = { items, nextCursor };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/audit/recent error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener auditoría" },
      { status: 500 },
    );
  }
}
