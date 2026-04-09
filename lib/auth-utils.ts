import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

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

/**
 * Get the role name for a user from the database.
 */
export async function getUserRole(userId: string): Promise<string | null> {
  const userRole = await prisma.userRole.findFirst({
    where: { userId },
    include: { role: true },
  });
  return userRole?.role?.name ?? null;
}

/**
 * Check if a user has the "medic" role.
 */
export async function isMedic(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === "medic";
}
