import type { Metadata } from "next";
import { BookingManage } from "@/components/booking/booking-manage";

// Link de gestión de una reserva online (sin login): ver estado o cancelar.
// Contrato: lib/openapi/paths/public.ts → /api/public/booking/{token}.

export const metadata: Metadata = {
  title: "Tu reserva",
  robots: { index: false, follow: false, nocache: true },
  // El token viaja en la URL: que no se filtre por Referer.
  referrer: "no-referrer",
};

export default async function ReservaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BookingManage token={token} />;
}
