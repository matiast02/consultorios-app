import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Get the current authenticated user from the session.
 * Returns null if the user is not authenticated.
 * Use this in Server Components and API routes.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 * Use this at the top of protected Server Components or layouts.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Get the current user's ID from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
