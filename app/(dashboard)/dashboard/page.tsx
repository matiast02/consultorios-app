import { requireAuth } from "@/lib/auth-utils";
import { DashboardContent } from "./dashboard-content";
import { MedicDashboard } from "@/components/medic-dashboard";
import { SecretaryDashboard } from "@/components/secretary-dashboard";

export default async function DashboardPage() {
  const user = await requireAuth();
  const role = (user as { role?: string }).role ?? null;
  const userName = user.name ?? "Usuario";

  if (role === "medic") {
    return <MedicDashboard userName={userName} />;
  }

  if (role === "secretary") {
    return <SecretaryDashboard userName={userName} />;
  }

  return <DashboardContent userName={userName} />;
}
