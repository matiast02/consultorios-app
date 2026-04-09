import { prisma } from "@/lib/prisma";

/**
 * Check if a module is enabled for a specific user.
 * Logic: ModuleConfig.enabled AND (no UserModuleAccess override OR override.enabled)
 */
export async function isModuleEnabled(
  module: string,
  userId?: string
): Promise<boolean> {
  // Check global toggle
  const config = await prisma.moduleConfig.findUnique({
    where: { module },
  });

  // If module doesn't exist in config, assume disabled
  if (!config || !config.enabled) return false;

  // If no userId, just check global
  if (!userId) return true;

  // Check per-user override
  const userAccess = await prisma.userModuleAccess.findUnique({
    where: { userId_module: { userId, module } },
  });

  // If no override exists, module is enabled (global is true)
  if (!userAccess) return true;

  // User-specific override
  return userAccess.enabled;
}

/**
 * Check module access and return a simple boolean.
 * Useful in API routes to gate functionality.
 */
export async function checkModuleAccess(
  module: string,
  userId: string
): Promise<boolean> {
  return isModuleEnabled(module, userId);
}
