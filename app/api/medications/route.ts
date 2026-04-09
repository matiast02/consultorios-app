import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMedicationSchema } from "@/lib/validations";
import { getUserRole } from "@/lib/auth-utils";

// GET /api/medications — Search medications
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
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { genericName: { contains: search } },
      ];
    }

    const medications = await prisma.medication.findMany({
      where,
      orderBy: { name: "asc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: medications });
  } catch (error) {
    console.error("GET /api/medications error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener medicamentos" },
      { status: 500 }
    );
  }
}

// POST /api/medications — Create a medication (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const role = await getUserRole(session.user.id!);
    if (role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo administradores" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createMedicationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, genericName, presentation, category } = parsed.data;

    // Check unique name
    const existing = await prisma.medication.findFirst({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe un medicamento con ese nombre" },
        { status: 409 }
      );
    }

    const medication = await prisma.medication.create({
      data: {
        name,
        genericName: genericName ?? null,
        presentation: presentation ?? null,
        category: category ?? null,
      },
    });

    return NextResponse.json({ success: true, data: medication }, { status: 201 });
  } catch (error) {
    console.error("POST /api/medications error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear medicamento" },
      { status: 500 }
    );
  }
}
