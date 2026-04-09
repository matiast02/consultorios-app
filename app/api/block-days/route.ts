import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/block-days — Get block days for a user within a date range
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { searchParams } = req.nextUrl;
    const userId = searchParams.get("userId") || session.user.id;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId es obligatorio" },
        { status: 400 }
      );
    }

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: "Los parámetros 'from' y 'to' son obligatorios" },
        { status: 400 }
      );
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Formato de fecha inválido" },
        { status: 400 }
      );
    }

    const blockDays = await prisma.blockDay.findMany({
      where: {
        userId,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ success: true, data: blockDays });
  } catch (error) {
    console.error("GET /api/block-days error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener días bloqueados" },
      { status: 500 }
    );
  }
}
