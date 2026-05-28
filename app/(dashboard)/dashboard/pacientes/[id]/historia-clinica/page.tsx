import { redirect } from "next/navigation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Backwards-compat redirect. The /historia-clinica sub-route is gone — the
 * patient detail page now hosts the Historia clínica tab inline.
 */
export default async function HistoriaClinicaRedirect({ params }: RouteContext) {
  const { id } = await params;
  redirect(`/dashboard/pacientes/${id}?tab=historia`);
}
