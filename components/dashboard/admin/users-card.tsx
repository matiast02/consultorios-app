"use client";

import { Shield, Stethoscope, UserCog, UserX, Users } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";

import type {
  InactiveUserItem,
  RecentLoginItem,
  UsersBreakdown,
} from "@/types";

interface UsersCardProps {
  users: UsersBreakdown;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(seed: string): string {
  const palette = [
    "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
    "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Nunca";
  try {
    return formatDistanceToNowStrict(new Date(iso), { locale: es, addSuffix: true });
  } catch {
    return iso;
  }
}

function MiniStat({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: typeof Users;
  label: string;
  value: number;
  tone: "emerald" | "sky" | "violet" | "slate";
}) {
  const toneClass: Record<typeof tone, { bg: string; icon: string }> = {
    emerald: {
      bg: "bg-emerald-100 dark:bg-emerald-950/40",
      icon: "text-emerald-600",
    },
    sky: { bg: "bg-sky-100 dark:bg-sky-950/40", icon: "text-sky-600" },
    violet: {
      bg: "bg-violet-100 dark:bg-violet-950/40",
      icon: "text-violet-600",
    },
    slate: { bg: "bg-muted", icon: "text-muted-foreground" },
  };
  const t = toneClass[tone];
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.bg}`}
      >
        <Icon className={`h-3.5 w-3.5 ${t.icon}`} />
      </div>
      <div className="leading-tight">
        <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
        <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

export function UsersCard({ users }: UsersCardProps) {
  const recent = users.recentLogins.slice(0, 5);
  const inactive = users.inactiveUsers30d.items.slice(0, 5);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-muted-foreground" />
        Usuarios
      </div>

      {/* Activos por rol */}
      <div className="grid grid-cols-2 gap-2 border-b px-4 py-3">
        <MiniStat
          Icon={Stethoscope}
          label="Médicos"
          value={users.activeByRole.medic}
          tone="emerald"
        />
        <MiniStat
          Icon={UserCog}
          label="Secretarias"
          value={users.activeByRole.secretary}
          tone="sky"
        />
        <MiniStat
          Icon={Shield}
          label="Admins"
          value={users.activeByRole.admin}
          tone="violet"
        />
        <MiniStat
          Icon={UserX}
          label="Inactivos"
          value={users.activeByRole.inactive}
          tone="slate"
        />
      </div>

      {/* Últimos logins */}
      <div className="border-b">
        <div className="px-5 pt-3 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos logins
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-4 text-xs text-muted-foreground">
            Sin actividad reciente.
          </div>
        ) : (
          <ul className="divide-y">
            {recent.map((u: RecentLoginItem) => {
              const av = avatarColor(`${u.userId}${u.name}`);
              return (
                <li key={`${u.userId}-${u.loggedAt}`} className="flex items-center gap-3 px-5 py-2.5">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${av}`}
                  >
                    {initials(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground">
                      {u.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[11px] text-muted-foreground">
                      {u.role && <span className="capitalize">{u.role}</span>}
                      {u.role && <span className="text-muted-foreground/40">·</span>}
                      <span>{relativeTime(u.loggedAt)}</span>
                    </div>
                  </div>
                  {u.ipAddress && (
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                      {u.ipAddress}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Inactivos */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sin login 30+ días
          </span>
          <span className="text-xl font-bold tabular-nums text-foreground">
            {users.inactiveUsers30d.count}
          </span>
        </div>
        {inactive.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Todos los usuarios están activos.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {inactive.map((u: InactiveUserItem) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 text-[12.5px]"
              >
                <span className="truncate text-foreground/90">{u.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {relativeTime(u.lastLoginAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
