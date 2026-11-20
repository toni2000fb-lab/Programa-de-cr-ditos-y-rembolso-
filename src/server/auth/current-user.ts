import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import type { Actor } from "@/server/services/types";
import { prisma } from "@/server/db";
import { DomainError } from "@/domain/errors";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export type { Actor };

/** Usuario autenticado según la cookie firmada; el rol se obtiene de la BD. */
export async function getCurrentUser(): Promise<Actor | null> {
  const store = await cookies();
  const userId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
}

/** Exige sesión y (opcionalmente) un rol concreto. Lanza DomainError 401/403. */
export async function requireUser(...roles: Role[]): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) throw new DomainError("UNAUTHENTICATED", "Debes iniciar sesión");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new DomainError("FORBIDDEN", "No tienes permisos para realizar esta acción");
  }
  return user;
}
