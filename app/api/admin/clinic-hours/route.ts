import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { clinicHoursWeekSchema } from "@/lib/validations";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }) };
  }
  const role = await getUserRole(session.user.id);
  if (role !== "admin") {
    return { error: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  try {
    // Ensure 7 rows exist (self-heal in case seed wasn't applied)
    const existing = await prisma.clinicHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    if (existing.length < 7) {
      const present = new Set(existing.map((h) => h.dayOfWeek));
      for (let dow = 0; dow < 7; dow++) {
        if (!present.has(dow)) {
          await prisma.clinicHours.create({ data: { dayOfWeek: dow, closed: true } });
        }
      }
    }

    const hours = await prisma.clinicHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    return NextResponse.json({ success: true, data: hours });
  } catch (error) {
    console.error("GET /api/admin/clinic-hours error:", error);
    return NextResponse.json(
      { success: false, error: "Error al leer los horarios" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json();
    const parsed = clinicHoursWeekSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const seenDays = new Set<number>();
    for (const d of parsed.data) {
      if (seenDays.has(d.dayOfWeek)) {
        return NextResponse.json(
          { success: false, error: `dayOfWeek=${d.dayOfWeek} duplicado` },
          { status: 400 }
        );
      }
      seenDays.add(d.dayOfWeek);
    }

    await prisma.$transaction(
      parsed.data.map((d) =>
        prisma.clinicHours.upsert({
          where: { dayOfWeek: d.dayOfWeek },
          update: {
            closed: d.closed,
            amOpen: d.closed ? null : d.amOpen || null,
            amClose: d.closed ? null : d.amClose || null,
            pmOpen: d.closed ? null : d.pmOpen || null,
            pmClose: d.closed ? null : d.pmClose || null,
          },
          create: {
            dayOfWeek: d.dayOfWeek,
            closed: d.closed,
            amOpen: d.closed ? null : d.amOpen || null,
            amClose: d.closed ? null : d.amClose || null,
            pmOpen: d.closed ? null : d.pmOpen || null,
            pmClose: d.closed ? null : d.pmClose || null,
          },
        })
      )
    );

    const hours = await prisma.clinicHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    return NextResponse.json({ success: true, data: hours });
  } catch (error) {
    console.error("PUT /api/admin/clinic-hours error:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar los horarios" },
      { status: 500 }
    );
  }
}
