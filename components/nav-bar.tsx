"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { MobileSidebar } from "@/components/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, LayoutDashboard, Stethoscope, ChevronRight, Sun, Moon } from "lucide-react";
import {
  LayoutDashboard as DashboardIcon,
  Calendar,
  Users,
  BarChart3,
} from "lucide-react";
import { useTheme } from "next-themes";

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/calendario": "Calendario",
  "/dashboard/pacientes": "Pacientes",
  "/dashboard/estadisticas": "Estadísticas",
  "/dashboard/configuracion": "Configuración",
};

const PAGE_ICONS: Record<string, React.ElementType> = {
  "/dashboard": DashboardIcon,
  "/dashboard/calendario": Calendar,
  "/dashboard/pacientes": Users,
  "/dashboard/estadisticas": BarChart3,
  "/dashboard/configuracion": Settings,
};

function PageTitle() {
  const pathname = usePathname();

  // Find matching label (most specific first)
  const sortedKeys = Object.keys(PAGE_LABELS).sort((a, b) => b.length - a.length);
  const matchedKey = sortedKeys.find((k) => pathname.startsWith(k));
  const label = matchedKey ? PAGE_LABELS[matchedKey] : null;
  const Icon = matchedKey ? PAGE_ICONS[matchedKey] : null;

  if (!label) return null;

  return (
    <div className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
      <span>Consultorio</span>
      <ChevronRight className="h-3.5 w-3.5" />
      <div className="flex items-center gap-1.5 text-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        <span className="font-medium">{label}</span>
      </div>
    </div>
  );
}

export function NavBar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <MobileSidebar />

          {/* Brand — visible on mobile */}
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Stethoscope className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">ConsultorioApp</span>
          </Link>

          {/* Breadcrumb — visible on desktop */}
          <div className="hidden md:flex">
            <PageTitle />
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Cambiar tema</span>
          </Button>
          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full p-0 ring-2 ring-transparent transition-all duration-200 hover:ring-primary/30"
                >
                  <UserAvatar
                    name={session.user.name}
                    image={session.user.image}
                    className="h-9 w-9"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={session.user.name}
                      image={session.user.image}
                      className="h-8 w-8 shrink-0"
                    />
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-medium leading-none">
                        {session.user.name ?? "Usuario"}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {session.user.email}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="cursor-pointer">
                    <LayoutDashboard className="mr-2 h-4 w-4 text-primary" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/configuracion"
                    className="cursor-pointer"
                  >
                    <Settings className="mr-2 h-4 w-4 text-primary" />
                    Configuración
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Iniciar sesión</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Registrarse</Link>
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
