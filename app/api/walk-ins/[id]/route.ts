import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = (await req.json()) as {
      leftAt?: string | null;
      assignedShiftId?: string | null;
      note?: string | null;
      markLeftNow?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (body.markLeftNow) {
      data.leftAt = new Date();
    } else if (body.leftAt !== undefined) {
      data.leftAt = body.leftAt ? new Date(body.leftAt) : null;
    }
    if (body.assignedShiftId !== undefined) data.assignedShiftId = body.assignedShiftId;
    if (body.note !== undefined) data.note = body.note;

    const updated = await prisma.walkInArrival.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("PATCH /api/walk-ins/[id] error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    await prisma.walkInArrival.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/walk-ins/[id] error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
