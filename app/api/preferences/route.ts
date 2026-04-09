import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertPreferencesSchema } from "@/lib/validations";

// GET /api/preferences — Get user preferences + blocked days
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

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId es obligatorio" },
        { status: 400 }
      );
    }

    const [preferences, blockDays] = await Promise.all([
      prisma.userPreference.findMany({
        where: { userId },
        orderBy: { day: "asc" },
      }),
      prisma.blockDay.findMany({
        where: { userId },
        orderBy: { date: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { preferences, blockDays },
    });
  } catch (error) {
    console.error("GET /api/preferences error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener preferencias" },
      { status: 500 }
    );
  }
}

// POST /api/preferences — Create or update preferences
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
    const parsed = upsertPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, preferences } = parsed.data;

    // Upsert each day preference in a transaction
    const result = await prisma.$transaction(
      preferences.map((pref) =>
        prisma.userPreference.upsert({
          where: { userId_day: { userId, day: pref.day } },
          update: {
            fromHourAM: pref.fromHourAM ?? null,
            toHourAM: pref.toHourAM ?? null,
            fromHourPM: pref.fromHourPM ?? null,
            toHourPM: pref.toHourPM ?? null,
          },
          create: {
            userId,
            day: pref.day,
            fromHourAM: pref.fromHourAM ?? null,
            toHourAM: pref.toHourAM ?? null,
            fromHourPM: pref.fromHourPM ?? null,
            toHourPM: pref.toHourPM ?? null,
          },
        })
      )
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("POST /api/preferences error:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar preferencias" },
      { status: 500 }
    );
  }
}

// PUT /api/preferences — Alias for POST (create or update preferences)
export async function PUT(req: NextRequest) {
  return POST(req);
}
