"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
  type AuditEvent,
  type AuditRecentResponse,
  type AuditSeverity,
} from "@/types";

interface ActivityFeedCardProps {
  initialItems: AuditEvent[];
}

type FilterChip =
  | "all"
  | "logins"
  | "deletions"
  | "sensitive"
  | "edits";

const CHIP_LABELS: Record<FilterChip, string> = {
  all: "Todo",
  logins: "Logins",
  deletions: "Eliminaciones",
  sensitive: "Datos sensibles",
  edits: "Edición",
};

const CHIP_ACTIONS: Record<FilterChip, AuditAction[] | null> = {
  all: null,
  logins: ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGIN_BLOCKED"],
  deletions: ["DELETE"],
  sensitive: ["VIEW_SENSITIVE"],
  edits: ["CREATE", "UPDATE"],
};

const ACTION_COLORS: Record<AuditAction, string> = {
  LOGIN_SUCCESS:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60",
  LOGIN_FAILED:
    "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60",
  LOGIN_BLOCKED:
    "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60",
  LOGOUT:
    "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:ring-slate-700",
  PASSWORD_CHANGED:
    "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/60",
  CREATE:
    "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900/60",
  UPDATE:
    "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60",
  DELETE:
    "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60",
  VIEW_SENSITIVE:
    "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60",
};

const SEVERITY_DOT: Record<AuditSeverity, string> = {
  info: "bg-slate-400",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
};

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { locale: es, addSuffix: true });
  } catch {
    return iso;
  }
}

export function ActivityFeedCard({ initialItems }: ActivityFeedCardProps) {
  const [items, setItems] = useState<AuditEvent[]>(initialItems);
  const [filter, setFilter] = useState<FilterChip>("all");
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // Keep `items` in sync when the parent gets fresh data via polling AND the user has the "all" filter active and hasn't paginated yet.
  useEffect(() => {
    if (filter === "all" && nextCursor === null && !exhausted) {
      setItems(initialItems);
    }
    // Only re-sync when initialItems reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems]);

  const buildQuery = useCallback(
    (chip: FilterChip, before?: string | null, limit = 20) => {
      const params = new URLSearchParams();
      const actions = CHIP_ACTIONS[chip];
      if (actions) params.set("action", actions.join(","));
      if (before) params.set("before", before);
      params.set("limit", String(limit));
      return params.toString();
    },
    [],
  );

  const handleFilter = useCallback(
    async (chip: FilterChip) => {
      if (chip === filter) return;
      setFilter(chip);
      setLoadingFilter(true);
      setNextCursor(null);
      setExhausted(false);
      try {
        const res = await fetch(`/api/audit/recent?${buildQuery(chip)}`);
        if (!res.ok) throw new Error();
        const json: { success: boolean; data: AuditRecentResponse } = await res.json();
        const data = json.data ?? { items: [], nextCursor: null };
        setItems(data.items);
        setNextCursor(data.nextCursor);
        if (!data.nextCursor) setExhausted(true);
      } catch {
        toast.error("No se pudo cargar la actividad");
        setItems([]);
      } finally {
        setLoadingFilter(false);
      }
    },
    [filter, buildQuery],
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || exhausted) return;
    const cursor =
      nextCursor ?? (items.length > 0 ? items[items.length - 1].createdAt : null);
    if (!cursor) {
      setExhausted(true);
      return;
    }
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/audit/recent?${buildQuery(filter, cursor)}`);
      if (!res.ok) throw new Error();
      const json: { success: boolean; data: AuditRecentResponse } = await res.json();
      const data = json.data ?? { items: [], nextCursor: null };
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
      if (!data.nextCursor || data.items.length === 0) setExhausted(true);
    } catch {
      toast.error("No se pudo cargar más actividad");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, exhausted, nextCursor, items, buildQuery, filter]);

  const chips = useMemo(() => Object.keys(CHIP_LABELS) as FilterChip[], []);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Actividad reciente
          <span className="grid min-w-[22px] place-items-center rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-bold leading-none tabular-nums text-muted-foreground">
            {items.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((c) => {
            const active = filter === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleFilter(c)}
                className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                  active
                    ? "bg-[#0d4f4d] text-white"
                    : "border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {CHIP_LABELS[c]}
              </button>
            );
          })}
        </div>
      </div>

      {loadingFilter ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Activity className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">Sin actividad reciente</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuando ocurra un evento auditable aparecerá acá.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((it) => {
            const dot = SEVERITY_DOT[it.severity] ?? "bg-slate-400";
            const badge = ACTION_COLORS[it.action];
            const label = AUDIT_ACTION_LABELS[it.action] ?? it.action;
            return (
              <li key={it.id} className="flex items-start gap-3 px-5 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${badge}`}
                    >
                      {label}
                    </span>
                    <span className="truncate text-[13px] text-foreground/90">
                      <span className="font-medium">{it.userName ?? "Sistema"}</span>
                      <span className="text-muted-foreground"> · {it.resource}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{relativeTime(it.createdAt)}</span>
                    {it.ipAddress && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="font-mono text-[10.5px]">{it.ipAddress}</span>
                      </>
                    )}
                    {it.userRole && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="capitalize">{it.userRole}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loadingFilter && items.length > 0 && (
        <div className="border-t px-5 py-2.5 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore || exhausted}
            className="inline-flex items-center gap-2 text-xs font-medium text-[#0d4f4d] transition hover:text-[#0a3f3d] disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
            {exhausted ? "No hay más actividad" : loadingMore ? "Cargando..." : "Ver más"}
          </button>
        </div>
      )}
    </div>
  );
}
