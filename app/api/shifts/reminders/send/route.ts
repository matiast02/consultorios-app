import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import { runReminderCycle } from "@/lib/reminders/scheduler";

// POST /api/shifts/reminders/send — planifica y despacha los recordatorios
// vencidos. Los EMAIL se envían; los WHATSAPP quedan manuales (waLink) para
// que recepción los mande y los marque. Recepción / admin.
export async function POST() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Solo recepción o admin" }, { status: 403 });
    }

    const summary = await runReminderCycle(new Date());
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("POST /api/shifts/reminders/send error:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar recordatorios" },
      { status: 500 },
    );
  }
}
