import "server-only";
import { z } from "zod";
import { DomainError } from "@/domain/errors";

const uuid = z.uuid();

export async function routeId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new DomainError("NOT_FOUND", "Solicitud no encontrada");
  return id;
}

const keySchema = z.string().trim().min(8).max(200);

/** Las operaciones de decisión exigen la cabecera Idempotency-Key. */
export function idempotencyKey(request: Request): string {
  const parsed = keySchema.safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success) {
    throw new DomainError("VALIDATION", "Falta la cabecera Idempotency-Key (8–200 caracteres)");
  }
  return parsed.data;
}
