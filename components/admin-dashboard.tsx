"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AdminDashboardHeader } from "@/components/dashboard/admin/dashboard-header";
import { AdminStatsRow } from "@/components/dashboard/admin/stats-row";
import { ActivityFeedCard } from "@/components/dashboard/admin/activity-feed-card";
import { CatalogHealthCard } from "@/components/dashboard/admin/catalog-health-card";
import { UsersCard } from "@/components/dashboard/admin/users-card";
import { TrendsCard } from "@/components/dashboard/admin/trends-card";

import type { AdminDashboardData } from "@/types";

interface AdminDashboardProps {
  userName: string;
}

export function AdminDashboard({ userName }: AdminDashboardProps) {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/admin");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data ?? null);
    } catch {
      toast.error("No se pudo cargar el dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Polling cada 60s (el dashboard admin no necesita refresco agresivo).
  useEffect(() => {
    const id = setInterval(() => {
      fetchDashboard();
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        No se pudo cargar el dashboard. Intentá recargar la página.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminDashboardHeader
        adminName={userName || data.header.adminName}
        totalUsers={data.header.totalUsers}
        totalPatients={data.header.totalPatients}
      />

      <AdminStatsRow stats={data.stats} />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <ActivityFeedCard initialItems={data.activityFeed} />

        <div className="space-y-6">
          <CatalogHealthCard health={data.catalogHealth} />
          <UsersCard users={data.users} />
        </div>
      </div>

      <TrendsCard trends={data.trends} />
    </div>
  );
}
