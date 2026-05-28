import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const body = (await req.json()) as {
      patientId?: string | null;
      firstName?: string;
      lastName?: string;
      telephone?: string | null;
      note?: string | null;
    };

    let firstName = body.firstName?.trim() ?? "";
    let lastName = body.lastName?.trim() ?? "";
    let telephone = body.telephone ?? null;
    const patientId: string | null = body.patientId ?? null;

    // If patientId provided but missing names, pull from DB
    if (patientId && (!firstName || !lastName)) {
      const p = await prisma.patient.findUnique({ where: { id: patientId } });
      if (p) {
        firstName = firstName || p.firstName;
        lastName = lastName || p.lastName;
        telephone = telephone ?? p.telephone;
      }
    }

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: "Nombre y apellido son obligatorios" },
        { status: 400 },
      );
    }

    const walkIn = await prisma.walkInArrival.create({
      data: {
        patientId,
        firstName,
        lastName,
        telephone,
        note: body.note ?? null,
        arrivedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: walkIn });
  } catch (e) {
    console.error("POST /api/walk-ins error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
