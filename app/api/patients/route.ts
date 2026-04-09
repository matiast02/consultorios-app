import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPatientSchema, paginationSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

// GET /api/patients — List patients with optional search
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

    const pagination = paginationSchema.safeParse({
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "20",
    });

    if (!pagination.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros de paginación inválidos" },
        { status: 400 }
      );
    }

    const { page, limit } = pagination.data;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { dni: { contains: search } },
      ];
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: { os: true },
        orderBy: { lastName: "asc" },
        skip,
        take: limit,
      }),
      prisma.patient.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: patients,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/patients error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener pacientes" },
      { status: 500 }
    );
  }
}

// POST /api/patients — Create patient
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createPatientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check unique DNI if provided
    if (data.dni) {
      const existing = await prisma.patient.findFirst({
        where: { dni: data.dni, deletedAt: null },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "Ya existe un paciente con ese DNI" },
          { status: 409 }
        );
      }
    }

    const patient = await prisma.patient.create({
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
      },
      include: { os: true },
    });

    logAudit({
      userId: session.user.id!,
      action: "CREATE",
      resource: "patient",
      resourceId: patient.id,
      details: { name: `${data.firstName} ${data.lastName}` },
      req,
    });

    return NextResponse.json({ success: true, data: patient }, { status: 201 });
  } catch (error) {
    console.error("POST /api/patients error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear paciente" },
      { status: 500 }
    );
  }
}
