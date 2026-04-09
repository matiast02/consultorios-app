import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addBlockDaysSchema, removeBlockDaySchema } from "@/lib/validations";

// POST /api/preferences/block-days — Add blocked days (alias)
export async function POST(req: NextRequest) {
  return PUT(req);
}

// PUT /api/preferences/block-days — Add blocked days
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = addBlockDaysSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, dates } = parsed.data;

    // Use createMany with skipDuplicates to avoid errors on existing dates
    const result = await prisma.blockDay.createMany({
      data: dates.map((dateStr) => ({
        userId,
        date: new Date(dateStr),
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      data: { created: result.count },
    });
  } catch (error) {
    console.error("PUT /api/preferences/block-days error:", error);
    return NextResponse.json(
      { success: false, error: "Error al agregar días bloqueados" },
      { status: 500 }
    );
  }
}

// DELETE /api/preferences/block-days — Remove a blocked day
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = removeBlockDaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = parsed.data;

    const existing = await prisma.blockDay.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Día bloqueado no encontrado" },
        { status: 404 }
      );
    }

    await prisma.blockDay.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/preferences/block-days error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar día bloqueado" },
      { status: 500 }
    );
  }
}
