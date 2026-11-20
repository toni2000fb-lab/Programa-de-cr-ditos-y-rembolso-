import type { Prisma, RequestStatus, Role } from "@prisma/client";
import type { Db } from "@/server/db";

type Tx = Prisma.TransactionClient;

export interface AuditEntryInput {
  requestId: string;
  actor: { id: string; role: Role };
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  comment?: string | null;
}

/** Inserta una entrada de auditoría. Debe llamarse dentro de la misma transacción del cambio de estado. */
export function recordTransition(tx: Tx, entry: AuditEntryInput) {
  return tx.auditLog.create({
    data: {
      requestId: entry.requestId,
      actorId: entry.actor.id,
      actorRole: entry.actor.role,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      comment: entry.comment ?? null,
    },
  });
}

export interface AuditView {
  id: number;
  requestId: string;
  applicantName: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  comment: string | null;
  timestamp: string; // ISO 8601
}

export async function listAudit(
  db: Db,
  opts: { afterId?: number; requestId?: string; limit?: number } = {},
): Promise<AuditView[]> {
  const rows = await db.auditLog.findMany({
    where: {
      ...(opts.afterId !== undefined ? { id: { gt: opts.afterId } } : {}),
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
    },
    orderBy: { id: opts.afterId !== undefined ? "asc" : "desc" },
    take: Math.min(opts.limit ?? 200, 500),
    include: { actor: { select: { name: true } }, request: { select: { applicantName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    requestId: r.requestId,
    applicantName: r.request.applicantName,
    actorId: r.actorId,
    actorName: r.actor.name,
    actorRole: r.actorRole,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    comment: r.comment,
    timestamp: r.createdAt.toISOString(),
  }));
}
