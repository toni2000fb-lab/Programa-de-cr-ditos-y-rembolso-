import { Prisma } from "@prisma/client";
import type { Db } from "@/server/db";
import { DomainError } from "@/domain/errors";

type Tx = Prisma.TransactionClient;

export interface IdempotencyScope {
  key: string;
  userId: string;
  action: string;
  requestId: string;
}

export interface IdempotentResult<T> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

async function findStored<T>(db: Db, scope: IdempotencyScope): Promise<IdempotentResult<T> | null> {
  const stored = await db.idempotencyKey.findUnique({ where: { key: scope.key } });
  if (!stored) return null;
  if (stored.userId !== scope.userId || stored.action !== scope.action || stored.requestId !== scope.requestId) {
    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya se utilizó para una operación diferente",
    );
  }
  return { statusCode: stored.statusCode, body: stored.response as T, replayed: true };
}

/**
 * Ejecuta `fn` en una transacción y guarda su respuesta asociada a la clave, en la misma
 * transacción. Si la clave ya existe se devuelve la respuesta original sin volver a ejecutar
 * la operación. Si dos peticiones con la misma clave llegan a la vez, una gana y la otra
 * —al fallar por la fila bloqueada o por la clave única— devuelve la respuesta ya guardada.
 */
export async function runIdempotent<T extends Prisma.InputJsonValue>(
  db: Db,
  scope: IdempotencyScope,
  fn: (tx: Tx) => Promise<T>,
): Promise<IdempotentResult<T>> {
  const existing = await findStored<T>(db, scope);
  if (existing) return existing;

  try {
    const body = await db.$transaction(
      async (tx) => {
        const result = await fn(tx);
        await tx.idempotencyKey.create({
          data: { ...scope, statusCode: 200, response: result },
        });
        return result;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    return { statusCode: 200, body, replayed: false };
  } catch (error) {
    // Otra petición con la misma clave pudo completarse mientras esperábamos.
    const stored = await findStored<T>(db, scope);
    if (stored) return stored;
    throw error;
  }
}
