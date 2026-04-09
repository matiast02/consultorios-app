import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { auditLogsQuerySchema } from "@/lib/validations";

// GET /api/audit-logs — List audit logs (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Only admin can access audit logs
    const role = await getUserRole(session.user.id);
    if (role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Acceso denegado" },
        { status: 403 }
      );
    }

    const { searchParams } = req.nextUrl;
    const parsed = auditLogsQuerySchema.safeParse({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      userId: searchParams.get("userId") || undefined,
      resource: searchParams.get("resource") || undefined,
      action: searchParams.get("action") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, userId, resource, action, from, to } = parsed.data;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (userId) {
      where.userId = userId;
    }
    if (resource) {
      where.resource = resource;
    }
    if (action) {
      where.action = action;
    }
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) {
        createdAt.gte = new Date(from);
      }
      if (to) {
        // Include the entire "to" day
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        createdAt.lte = toDate;
      }
      where.createdAt = createdAt;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/audit-logs error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener registros de auditoría" },
      { status: 500 }
    );
  }
}
