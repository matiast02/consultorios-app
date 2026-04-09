import { NavBar } from "@/components/nav-bar";
import { Sidebar } from "@/components/sidebar";
import { requireAuth } from "@/lib/auth-utils";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-screen-xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
