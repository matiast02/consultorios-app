"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Calendar,
  Users,
  BarChart3,
  Settings,
  Menu,
  Stethoscope,
  Heart,
  UserCog,
  GraduationCap,
  Clock,
  Shield,
  Puzzle,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Calendario",
    href: "/dashboard/calendario",
    icon: Calendar,
  },
  {
    label: "Pacientes",
    href: "/dashboard/pacientes",
    icon: Users,
  },
  {
    label: "Estadísticas",
    href: "/dashboard/estadisticas",
    icon: BarChart3,
  },
  {
    label: "Configuración",
    href: "/dashboard/configuracion",
    icon: Settings,
  },
];

const adminItems = [
  {
    label: "Obras Sociales",
    href: "/dashboard/administracion/obras-sociales",
    icon: Heart,
  },
  {
    label: "Especialidades",
    href: "/dashboard/administracion/especialidades",
    icon: GraduationCap,
  },
  {
    label: "Tipos de Consulta",
    href: "/dashboard/administracion/tipos-consulta",
    icon: Clock,
  },
  {
    label: "Usuarios",
    href: "/dashboard/administracion/usuarios",
    icon: UserCog,
  },
  {
    label: "Auditoria",
    href: "/dashboard/administracion/auditoria",
    icon: Shield,
  },
  {
    label: "Modulos",
    href: "/dashboard/administracion/modulos",
    icon: Puzzle,
  },
];

const ROLE_LABELS: Record<string, string> = {
  medic: "Médico",
  secretary: "Secretaria",
  admin: "Admin",
};

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "Usuario";

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary shadow-sm">
          <Stethoscope className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="text-base font-bold tracking-tight text-sidebar-foreground">
          ConsultorioApp
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              {/* Active left border indicator */}
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
              )}
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors duration-200",
                  isActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground"
                )}
              />
              {item.label}
            </Link>
          );
        })}

        {/* Admin section — only for admin and secretary */}
        {(role === "admin" || role === "secretary") && (
        <div className="mt-6 pt-4 border-t border-sidebar-border">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Administración
          </p>
          {adminItems.map((item) => {
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                )}
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-200",
                    isActive
                      ? "text-sidebar-primary"
                      : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
        )}
      </nav>

      {/* User info at bottom */}
      {session?.user && (
        <div className="border-t border-sidebar-border px-3 py-4">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground shadow-sm">
              {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {session.user.name ?? "Usuario"}
              </p>
              <Badge
                variant="secondary"
                className="mt-0.5 w-fit bg-sidebar-primary/20 text-[10px] text-sidebar-primary hover:bg-sidebar-primary/20"
              >
                {roleLabel}
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:block">
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <SidebarContent />
      </div>
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
