"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Puzzle,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react";
import type { ModuleConfig, Medic } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ModuleUserConfig {
  id: string;
  userId: string;
  module: string;
  enabled: boolean;
  user: { name?: string | null; email?: string | null };
}

// ─── Module descriptions ────────────────────────────────────────────────────

const MODULE_DESCRIPTIONS: Record<string, string> = {
  prescriptions: "Permite crear, ver e imprimir recetas medicas para los pacientes.",
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ModulosPage() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [moduleUsers, setModuleUsers] = useState<Record<string, ModuleUserConfig[]>>({});
  const [allUsers, setAllUsers] = useState<Medic[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<string | null>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  const fetchModules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/modules");
      if (!res.ok) throw new Error("Error al cargar modulos");
      const json = await res.json();
      setModules(json.data ?? []);
    } catch {
      toast.error("No se pudieron cargar los modulos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  async function handleToggleModule(mod: ModuleConfig) {
    try {
      setTogglingModule(mod.module);
      const res = await fetch("/api/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: mod.module, enabled: !mod.enabled }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al actualizar modulo");
      }

      toast.success(
        `Modulo "${mod.name}" ${!mod.enabled ? "activado" : "desactivado"}`
      );
      setModules((prev) =>
        prev.map((m) =>
          m.module === mod.module ? { ...m, enabled: !m.enabled } : m
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar"
      );
    } finally {
      setTogglingModule(null);
    }
  }

  async function handleExpandModule(moduleKey: string) {
    if (expandedModule === moduleKey) {
      setExpandedModule(null);
      return;
    }

    setExpandedModule(moduleKey);

    // Fetch module users and all users in parallel
    if (!moduleUsers[moduleKey]) {
      try {
        setLoadingUsers(moduleKey);
        const [usersRes, allUsersRes] = await Promise.all([
          fetch(`/api/modules/${moduleKey}/users`),
          allUsers.length === 0 ? fetch("/api/users") : Promise.resolve(null),
        ]);

        if (usersRes.ok) {
          const json = await usersRes.json();
          setModuleUsers((prev) => ({ ...prev, [moduleKey]: json.data ?? [] }));
        }

        if (allUsersRes && allUsersRes.ok) {
          const json = await allUsersRes.json();
          setAllUsers(json.data ?? []);
        }
      } catch {
        toast.error("Error al cargar usuarios del modulo");
      } finally {
        setLoadingUsers(null);
      }
    }
  }

  async function handleToggleUser(moduleKey: string, userId: string, currentEnabled: boolean) {
    const toggleKey = `${moduleKey}-${userId}`;
    try {
      setTogglingUser(toggleKey);
      const res = await fetch(`/api/modules/${moduleKey}/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enabled: !currentEnabled }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al actualizar usuario");
      }

      toast.success("Permiso de usuario actualizado");

      // Update local state
      setModuleUsers((prev) => {
        const existing = prev[moduleKey] ?? [];
        const found = existing.find((u) => u.userId === userId);
        if (found) {
          return {
            ...prev,
            [moduleKey]: existing.map((u) =>
              u.userId === userId ? { ...u, enabled: !currentEnabled } : u
            ),
          };
        }
        // If user override didn't exist yet, re-fetch
        fetch(`/api/modules/${moduleKey}/users`)
          .then((r) => r.json())
          .then((json) =>
            setModuleUsers((p) => ({ ...p, [moduleKey]: json.data ?? [] }))
          );
        return prev;
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar"
      );
    } finally {
      setTogglingUser(null);
    }
  }

  function getUserEnabled(moduleKey: string, userId: string, globalEnabled: boolean): boolean {
    const userConfig = moduleUsers[moduleKey]?.find((u) => u.userId === userId);
    if (userConfig) return userConfig.enabled;
    return globalEnabled;
  }

  function getUserDisplayName(user: Medic): string {
    const parts = [user.firstName, user.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return user.name ?? "Usuario";
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Modulos</h1>
        <p className="text-muted-foreground">
          Gestiona los modulos del sistema y permisos por usuario
        </p>
      </div>

      {/* Module list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </div>
      ) : modules.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Puzzle className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="mt-4 font-medium text-foreground">
                No hay modulos configurados
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Los modulos se configuran desde el backend del sistema.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {modules.map((mod) => {
            const isExpanded = expandedModule === mod.module;
            const isLoadingUsers = loadingUsers === mod.module;
            const globalEnabled = mod.enabled;

            return (
              <Card key={mod.id} className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <Puzzle className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{mod.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {MODULE_DESCRIPTIONS[mod.module] ?? `Modulo: ${mod.module}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label htmlFor={`switch-${mod.module}`} className="text-sm text-muted-foreground">
                        {mod.enabled ? "Activo" : "Inactivo"}
                      </Label>
                      <Switch
                        id={`switch-${mod.module}`}
                        checked={mod.enabled}
                        disabled={togglingModule === mod.module}
                        onCheckedChange={() => handleToggleModule(mod)}
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {/* Expand toggle for per-user overrides */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-muted-foreground"
                    onClick={() => handleExpandModule(mod.module)}
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Permisos por usuario
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      <Separator />
                      {isLoadingUsers ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : allUsers.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          No hay usuarios registrados
                        </p>
                      ) : (
                        <div className="space-y-1 pt-2">
                          {allUsers.map((user) => {
                            const userEnabled = getUserEnabled(
                              mod.module,
                              user.id,
                              globalEnabled
                            );
                            const toggleKey = `${mod.module}-${user.id}`;

                            return (
                              <div
                                key={user.id}
                                className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                    {getUserDisplayName(user).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {getUserDisplayName(user)}
                                    </p>
                                    {user.specialization && (
                                      <p className="text-xs text-muted-foreground">
                                        {user.specialization.name}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <Switch
                                  checked={userEnabled}
                                  disabled={togglingUser === toggleKey}
                                  onCheckedChange={() =>
                                    handleToggleUser(mod.module, user.id, userEnabled)
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
