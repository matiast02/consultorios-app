"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Clock, CalendarX, Shield } from "lucide-react";
import { ProfileTab } from "@/components/configuracion/profile-tab";
import { WorkHoursTab } from "@/components/configuracion/work-hours-tab";
import { BlockedDaysTab } from "@/components/configuracion/blocked-days-tab";
import { InsurancesTab } from "@/components/configuracion/insurances-tab";
import { differenceInDays, startOfDay } from "date-fns";
import type { BlockDay } from "@/types";

function TabLabel({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof User;
  label: string;
  count?: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary">
          {count}
        </span>
      )}
    </span>
  );
}


export default function ConfiguracionPage() {
  const { data: session, status } = useSession();
  const userRole = (session?.user as { role?: string | null } | undefined)?.role;
  const isMedicRole = userRole === "medic";

  // Lightweight counts for the tab badges
  const [blockRangeCount, setBlockRangeCount] = useState<number>(0);
  const [insuranceCount, setInsuranceCount] = useState<number>(0);

  useEffect(() => {
    if (status !== "authenticated" || !isMedicRole) return;
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return;

    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        const days: BlockDay[] = json.data?.blockDays ?? [];
        // Count ranges: consecutive same-category days are one range
        const sorted = [...days].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        let ranges = 0;
        let prevDate: Date | null = null;
        let prevCat: string | null = null;
        let prevNote: string | null = null;
        for (const day of sorted) {
          const d = startOfDay(new Date(day.date));
          const sameRun =
            prevDate &&
            prevCat === day.category &&
            (prevNote ?? null) === (day.note ?? null) &&
            differenceInDays(d, prevDate) === 1;
          if (!sameRun) ranges++;
          prevDate = d;
          prevCat = day.category;
          prevNote = day.note ?? null;
        }
        setBlockRangeCount(ranges);
      })
      .catch(() => {});

    fetch(`/api/users/${userId}/insurances`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        setInsuranceCount(json.accepted?.length ?? json.data?.length ?? 0);
      })
      .catch(() => {});
  }, [status, isMedicRole, session]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Gestioná tu perfil, horarios de atención y preferencias del consultorio.
        </p>
      </div>

      <Tabs defaultValue="perfil" className="w-full">
        <TabsList variant="pill">
          <TabsTrigger value="perfil">
            <TabLabel icon={User} label="Perfil" />
          </TabsTrigger>
          {isMedicRole && (
            <>
              <TabsTrigger value="horarios">
                <TabLabel icon={Clock} label="Horarios" />
              </TabsTrigger>
              <TabsTrigger value="bloqueados">
                <TabLabel icon={CalendarX} label="Días bloqueados" count={blockRangeCount} />
              </TabsTrigger>
              <TabsTrigger value="obras">
                <TabLabel icon={Shield} label="Obras sociales" count={insuranceCount} />
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
          <ProfileTab isMedicRole={isMedicRole} />
        </TabsContent>

        {isMedicRole && (
          <>
            <TabsContent value="horarios" className="mt-6">
              <WorkHoursTab />
            </TabsContent>
            <TabsContent value="bloqueados" className="mt-6">
              <BlockedDaysTab />
            </TabsContent>
            <TabsContent value="obras" className="mt-6">
              <InsurancesTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
