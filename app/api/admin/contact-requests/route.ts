import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";

const ALLOWED_ROLES = new Set(["admin", "secretary"]);
const VALID_STATUS = new Set(["new", "read", "archived", "all"]);

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const role = await getUserRole(session.user.id);
    if (!role || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    const statusParam = req.nextUrl.searchParams.get("status") || "all";
    if (!VALID_STATUS.has(statusParam)) {
      return NextResponse.json({ success: false, error: "status inválido" }, { status: 400 });
    }

    const where = statusParam === "all" ? undefined : { status: statusParam };

    const rows = await prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { specialization: { select: { id: true, name: true } } },
      take: 200,
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("GET /api/admin/contact-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener solicitudes" },
      { status: 500 }
    );
  }
}
