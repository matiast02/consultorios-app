"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell,
  CalendarCheck,
  FlaskConical,
  UserX,
  RefreshCw,
  CheckCheck,
} from "lucide-react";
import type { AppNotification } from "@/types";

const NOTIFICATION_ICONS: Record<string, React.ElementType> = {
  daily_summary: CalendarCheck,
  pending_studies: FlaskConical,
  inactive_patient: UserX,
  rescheduled: RefreshCw,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  daily_summary: "text-blue-500",
  pending_studies: "text-amber-500",
  inactive_patient: "text-red-500",
  rescheduled: "text-purple-500",
};

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data.notifications);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and poll every 60s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read && !readIds.has(n.id)).length;

  const markAsRead = async (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
    } catch {
      // silently fail
    }
  };

  const markAllAsRead = () => {
    const newReadIds = new Set(readIds);
    for (const n of notifications) {
      newReadIds.add(n.id);
    }
    setReadIds(newReadIds);

    // Fire requests for each in the background
    for (const n of notifications) {
      if (!readIds.has(n.id)) {
        fetch(`/api/notifications/${n.id}/read`, { method: "PUT" }).catch(() => {});
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notificaciones</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 sm:w-96"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notificaciones</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todo como leido
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Cargando...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No hay notificaciones
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => {
                const Icon =
                  NOTIFICATION_ICONS[notification.type] ?? Bell;
                const iconColor =
                  NOTIFICATION_COLORS[notification.type] ?? "text-muted-foreground";
                const isRead = notification.read || readIds.has(notification.id);

                return (
                  <li
                    key={notification.id}
                    className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/50 ${
                      isRead ? "opacity-60" : ""
                    }`}
                    onClick={() => {
                      if (!isRead) {
                        markAsRead(notification.id);
                      }
                    }}
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ${iconColor}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">
                          {notification.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                    </div>
                    {!isRead && (
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
