"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import type { DashboardRecentPatient } from "@/types";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function RecentPatientsCard({ patients }: { patients: DashboardRecentPatient[] }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          Pacientes recientes
        </div>
        <Link
          href="/dashboard/pacientes"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver todos
        </Link>
      </div>

      {patients.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Sin pacientes recientes</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {patients.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/pacientes/${p.id}`}
                className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition hover:bg-muted/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11.5px] font-bold text-primary">
                  {p.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {p.lastShiftType ?? "Consulta"}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatTime(p.lastShiftTime)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
