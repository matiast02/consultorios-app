import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";

/**
 * Mark all PENDING reminders for a given date as SENT.
 * This is a stub for the future real email/sms integration.
 * Default target date is tomorrow.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    let dateStr: string | undefined;
    try {
      const body = await req.json();
      dateStr = body?.date;
    } catch {
      // Empty body is fine
    }

    let target: Date;
    if (dateStr) {
      target = new Date(`${dateStr}T00:00:00`);
    } else {
      target = new Date();
      target.setHours(0, 0, 0, 0);
      target.setDate(target.getDate() + 1);
    }
    const dayAfter = new Date(target);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const result = await prisma.shiftReminder.updateMany({
      where: {
        scheduledFor: { gte: target, lt: dayAfter },
        status: "PENDING",
      },
      data: { status: "SENT", sentAt: new Date() },
    });

    return NextResponse.json({ success: true, data: { sent: result.count } });
  } catch (e) {
    console.error("POST /api/shifts/reminders/send error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
