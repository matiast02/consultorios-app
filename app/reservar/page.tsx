import type { Metadata } from "next";
import { BookingWizard } from "@/components/booking/booking-wizard";

// Reserva online pública (sin login): asistente de 4 pasos.
// Contrato: contracts/api-schemas/online-booking.yaml. El turno entra
// pendiente (source ONLINE) y recepción lo confirma.

export const metadata: Metadata = {
  title: "Reservá tu turno",
  description: "Elegí profesional, día y horario y pedí tu turno online.",
  robots: { index: false, follow: false, nocache: true },
};

const MEDIC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default async function ReservarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { medico } = await searchParams;
  // ?medico=<id> desde el botón "Turno" de la ficha de un profesional en la landing.
  const initialMedicId = typeof medico === "string" && MEDIC_ID_RE.test(medico) ? medico : null;
  return <BookingWizard initialMedicId={initialMedicId} />;
}
