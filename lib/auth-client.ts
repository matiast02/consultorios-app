// Better Auth — cliente para componentes React.
// Expone `useSession`, `signIn` y `signOut` con una forma compatible con la que
// tenían los componentes con next-auth/react, así el cambio es solo el import.

import { createAuthClient } from "better-auth/react";
import { customSessionClient } from "better-auth/client/plugins";
import type { auth } from "@/auth";

export const authClient = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
});

export interface ClientSessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
}

export interface ClientSession {
  user: ClientSessionUser;
}

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type RawSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

export function useSession(): {
  data: ClientSession | null;
  status: SessionStatus;
  /**
   * Vuelve a pedir la sesión al servidor (p.ej. tras editar el perfil).
   * Con sesiones en DB no hay nada que "actualizar" localmente: el argumento
   * se acepta por compatibilidad con la firma anterior y se ignora.
   */
  update: (_data?: unknown) => void;
} {
  const { data, isPending, refetch } = authClient.useSession();
  const user = data?.user as RawSessionUser | undefined;
  const session: ClientSession | null = user
    ? {
        user: {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          image: user.image ?? null,
          role: user.role ?? null,
        },
      }
    : null;
  return {
    data: session,
    status: isPending ? "loading" : session ? "authenticated" : "unauthenticated",
    update: () => {
      refetch();
    },
  };
}

export interface SignInError {
  message: string;
  status?: number;
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ error: SignInError | null }> {
  const { error } = await authClient.signIn.email({ email, password });
  if (!error) return { error: null };
  return {
    error: { message: error.message ?? "Error al iniciar sesion", status: error.status },
  };
}

export async function signOut(options?: { callbackUrl?: string }): Promise<void> {
  await authClient.signOut();
  if (options?.callbackUrl && typeof window !== "undefined") {
    window.location.href = options.callbackUrl;
  }
}
