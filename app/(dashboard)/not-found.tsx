import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function DashboardNotFound() {
  return (
    // Renders inside the dashboard <main> — NavBar and Sidebar stay visible.
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <FileQuestion className="h-14 w-14 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold">404</h2>
        <p className="text-muted-foreground">
          La seccion que buscas no existe
        </p>
        <Button asChild size="sm">
          <Link href="/dashboard">Volver al panel principal</Link>
        </Button>
      </div>
    </div>
  );
}
