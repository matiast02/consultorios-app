import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contactRequestSchema } from "@/lib/validations";
import { buildWhatsappLink, defaultPrefill } from "@/lib/whatsapp";
import { checkRateLimit } from "@/lib/rate-limit";

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`contact:${ip}`, { maxRequests: 5, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { success: false, error: "Demasiadas solicitudes. Probá de nuevo en unos minutos." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json();

    // ── Anti-bot (no external service) ────────────────────────────────────
    // 1) Honeypot: a hidden field real users never see. If it's filled, it's a
    //    bot. Return a success-shaped response so the bot can't detect the trap.
    // 2) Timing: forms submitted almost instantly are automated. Same response.
    const honeypot = typeof body?._hp === "string" ? body._hp.trim() : "";
    const elapsedMs = typeof body?._elapsedMs === "number" ? body._elapsedMs : null;
    if (honeypot.length > 0 || (elapsedMs !== null && elapsedMs < 1500)) {
      return NextResponse.json({ success: true, data: { id: null, whatsappLink: null } }, { status: 201 });
    }

    const parsed = contactRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Resolve specialization name (for the WhatsApp prefill)
    let specializationName: string | null = null;
    if (data.specializationId) {
      const spec = await prisma.specialization.findUnique({
        where: { id: data.specializationId },
        select: { name: true },
      });
      specializationName = spec?.name ?? null;
    }

    const created = await prisma.contactRequest.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email || null,
        healthInsurance: data.healthInsurance || null,
        specializationId: data.specializationId || null,
        preferredDay: data.preferredDay || null,
        message: data.message || null,
        ipAddress: ip,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      },
      select: { id: true },
    });

    // Build WhatsApp link if the clinic has a primary number configured.
    const settings = await prisma.clinicSettings.findUnique({
      where: { id: "default" },
      select: { whatsappPrimary: true, prefillWhatsappMessage: true },
    });

    let whatsappLink: string | null = null;
    if (settings?.whatsappPrimary) {
      const prefill = defaultPrefill({
        fullName: data.fullName,
        specialization: specializationName,
        preferredDay: data.preferredDay || null,
        customGreeting: settings.prefillWhatsappMessage,
      });
      whatsappLink = buildWhatsappLink(settings.whatsappPrimary, prefill);
    }

    return NextResponse.json(
      { success: true, data: { id: created.id, whatsappLink } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/public/contact-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar la solicitud" },
      { status: 500 }
    );
  }
}
