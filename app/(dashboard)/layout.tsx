import { NavBar } from "@/components/nav-bar";
import { requireAuth } from "@/lib/auth-utils";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This will redirect to /login if not authenticated
  await requireAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
