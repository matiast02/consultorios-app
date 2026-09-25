"use client";

import { useSession, type SessionStatus } from "@/lib/auth-client";

export interface CurrentUser {
  /** null hasta que la sesión resuelve o si no hay sesión. */
  id: string | null;
  name: string | null;
  role: string | null;
  status: SessionStatus;
  /** true mientras la sesión todavía no resolvió: no pedir datos que dependan del rol. */
  loading: boolean;
  isMedic: boolean;
  isSecretary: boolean;
  isAdmin: boolean;
}

/**
 * Usuario de la sesión, tipado. Reemplaza los `(session?.user as { id?: string })`
 * repartidos por los componentes: `useSession()` ya trae id y rol.
 */
export function useCurrentUser(): CurrentUser {
  const { data, status } = useSession();
  const role = data?.user.role ?? null;
  return {
    id: data?.user.id ?? null,
    name: data?.user.name ?? null,
    role,
    status,
    loading: status === "loading",
    isMedic: role === "medic",
    isSecretary: role === "secretary",
    isAdmin: role === "admin",
  };
}
