import type { Role } from "@prisma/client";
import type { Db } from "@/server/db";
import { DomainError } from "@/domain/errors";
import type { Actor } from "./types";
import { listAudit, type AuditView } from "./audit";
import { getBudget } from "./budget";
import { serializeRequest, type RequestDTO } from "./workflow";

/** Otra solicitud del mismo cliente (mismo documento), para ver cómo le ha ido antes. */
export interface ClientHistoryItem {
  id: string;
  status: RequestDTO["status"];
  amountCents: number;
  termMonths: number;
  createdAt: string;
  decidedAt: string | null;
  rejectionReason: string | null;
}

export interface RequestDetail {
  request: RequestDTO;
  /** Asesor de crédito que registró la solicitud. */
  createdBy: { id: string; name: string; role: Role };
  /** Otras solicitudes con el mismo documento, de la más reciente a la más antigua. */
  history: ClientHistoryItem[];
  /** Movimientos de esta solicitud, del más antiguo al más reciente. */
  audit: AuditView[];
  availableBudgetCents: number;
}

const HISTORY_LIMIT = 20;

/** Todo lo que el analista necesita para decidir sobre una solicitud, en una sola consulta. */
export async function getRequestDetail(db: Db, actor: Actor, id: string): Promise<RequestDetail> {
  if (actor.role !== "ANALISTA") {
    throw new DomainError("FORBIDDEN", "Solo un analista puede consultar el detalle de un cliente");
  }
  const request = await db.creditRequest.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true, role: true } } },
  });
  if (!request) throw new DomainError("NOT_FOUND", "Solicitud no encontrada");

  const [others, audit, budget] = await Promise.all([
    db.creditRequest.findMany({
      where: { documentId: request.documentId, id: { not: id } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    }),
    listAudit(db, { requestId: id }),
    getBudget(db),
  ]);

  const { createdBy, ...row } = request;
  return {
    request: serializeRequest(row, actor),
    createdBy,
    history: others.map((o) => ({
      id: o.id,
      status: o.status,
      amountCents: o.amountCents,
      termMonths: o.termMonths,
      createdAt: o.createdAt.toISOString(),
      decidedAt: o.decidedAt?.toISOString() ?? null,
      rejectionReason: o.rejectionReason,
    })),
    audit: audit.reverse(),
    availableBudgetCents: budget.availableCents,
  };
}
