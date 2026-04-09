import { requireAuth } from "@/lib/auth-utils";
import { DashboardContent } from "./dashboard-content";

export default async function DashboardPage() {
  const user = await requireAuth();

  return <DashboardContent userName={user.name ?? "Usuario"} />;
}
