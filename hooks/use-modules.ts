"use client";

import { useCallback, useMemo } from "react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import type { ModuleConfig } from "@/types";

/**
 * Módulos habilitados (toggle global de Administración → Módulos), cacheados con
 * SWR y compartidos entre componentes: antes cada diálogo pedía `/api/modules`
 * en cada apertura. `isEnabled` devuelve false mientras carga.
 */
export function useModules(enabled = true) {
  const { data, isLoading, refresh } = useCachedFetch<ModuleConfig[]>(enabled ? "/api/modules" : null, {
    dedupingInterval: 60_000,
  });
  const modules = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const isEnabled = useCallback(
    (module: string) => modules.find((m) => m.module === module)?.enabled ?? false,
    [modules],
  );
  return { modules, isEnabled, loading: isLoading, refresh };
}
