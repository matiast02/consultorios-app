// Credenciales email + contraseña.
// Better Auth guarda el hash en la tabla Account (providerId = "credential",
// accountId = id del usuario). Este módulo es el ÚNICO lugar que escribe o
// verifica hashes: lo usan las rutas de la app, el seed y la migración legacy.
//
// Algoritmo: bcrypt (cost 12). Se mantiene bcrypt en vez del scrypt por defecto
// de Better Auth para que sigan funcionando los hashes existentes y los del
// sistema viejo ($2a$…), que bcryptjs verifica sin cambios.

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

export const CREDENTIAL_PROVIDER = "credential";
const BCRYPT_COST = 12;

/** Cualquier cliente Prisma (base, extendido o transacción) con el modelo Account. */
export type CredentialsDb = unknown;

function asClient(db: CredentialsDb): Pick<PrismaClient, "account"> {
  return db as Pick<PrismaClient, "account">;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPasswordHash(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Crea o reemplaza la credencial de un usuario.
 * Acepta la contraseña en texto plano o un hash bcrypt ya calculado
 * (p.ej. el que viene del sistema viejo).
 */
export async function setUserPassword(
  db: CredentialsDb,
  userId: string,
  password: { plain: string } | { hash: string },
): Promise<void> {
  const hash = "hash" in password ? password.hash : await hashPassword(password.plain);
  await asClient(db).account.upsert({
    where: {
      providerId_accountId: { providerId: CREDENTIAL_PROVIDER, accountId: userId },
    },
    update: { password: hash },
    create: {
      userId,
      accountId: userId,
      providerId: CREDENTIAL_PROVIDER,
      password: hash,
    },
  });
}

export async function getUserPasswordHash(
  db: CredentialsDb,
  userId: string,
): Promise<string | null> {
  const account = await asClient(db).account.findUnique({
    where: {
      providerId_accountId: { providerId: CREDENTIAL_PROVIDER, accountId: userId },
    },
    select: { password: true },
  });
  return account?.password ?? null;
}

/** Verifica la contraseña actual de un usuario. Sin credencial → false. */
export async function verifyUserPassword(
  db: CredentialsDb,
  userId: string,
  plain: string,
): Promise<boolean> {
  const hash = await getUserPasswordHash(db, userId);
  if (!hash) return false;
  return verifyPasswordHash(plain, hash);
}
