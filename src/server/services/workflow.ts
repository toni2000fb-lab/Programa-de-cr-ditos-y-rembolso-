import type { CreditRequest, Prisma, RequestStatus } from "@prisma/client";
import type { Db } from "@/server/db";
import { DomainError } from "@/domain/errors";
import { canTransition, isFinal, STATUS_LABEL } from "@/domain/stateMachine";
import { rejectSchema } from "@/domain/rules";
import { formatMoney } from "@/domain/money";
import type { Actor } from "./types";
import { recordTransition } from "./audit";
import { BUDGET_ID } from "./budget";
import { runIdempotent } from "./idempotency";

type Tx = Prisma.TransactionClient;

function assertAnalyst(actor: Actor) {
  if (actor.role !== "ANALISTA") {
    throw new DomainError("FORBIDDEN", "Sólo un analista puede revisar, aprobar o rechazar solicitudes");
  }
}

/** Explica por qué una actualización condicional no afectó ninguna fila. */
async function explainFailedTransition(tx: Tx, id: string, to: RequestStatus): Promise<never> {
  const current = await tx.creditRequest.findUnique({ where: { id } });
  if (!current) throw new DomainError("NOT_FOUND", "Solicitud no encontrada");
  if (current.status === to) {
    throw new DomainError("ALREADY_PROCESSED", `La solicitud ya está en estado ${STATUS_LABEL[to]}`, {
      status: current.status,
    });
  }
  if (!canTransition(current.status, to)) {
    const why = isFinal(current.status) ? "ya fue resuelta y no admite reversiones" : "no admite ese salto de estado";
    throw new DomainError(
      "INVALID_TRANSITION",
      `Transición no permitida: ${STATUS_LABEL[current.status]} → ${STATUS_LABEL[to]} (la solicitud ${why})`,
      { from: current.status, to },
    );
  }
  if (to === "APROBADA" && current.bureauStatus !== "COMPLETADO") {
    throw new DomainError("BUREAU_REQUIRED", "No se puede aprobar sin una consulta de buró completada");
  }
  throw new DomainError("INVALID_TRANSITION", "La solicitud cambió de estado; recarga e inténtalo de nuevo");
}

/**
 * Transición atómica mediante actualización condicional (compare-and-set sobre `status`).
 * En PostgreSQL (READ COMMITTED) una segunda transacción concurrente espera al bloqueo de
 * fila de la primera y, al reevaluar el WHERE, no encuentra coincidencias: sólo una gana.
 */
async function transition(
  tx: Tx,
  id: string,
  from: RequestStatus,
  to: RequestStatus,
  extraWhere: Prisma.CreditRequestWhereInput = {},
  data: Prisma.CreditRequestUpdateManyMutationInput = {},
): Promise<CreditRequest> {
  if (!canTransition(from, to)) throw new Error(`Transición inválida en código: ${from} → ${to}`);
  const { count } = await tx.creditRequest.updateMany({
    where: { id, status: from, ...extraWhere },
    data: { ...data, status: to },
  });
  if (count === 0) await explainFailedTransition(tx, id, to);
  return tx.creditRequest.findUniqueOrThrow({ where: { id } });
}

function baseDto(r: CreditRequest) {
  return {
    id: r.id,
    applicantName: r.applicantName,
    documentId: r.documentId,
    monthlyIncomeCents: r.monthlyIncomeCents,
    amountCents: r.amountCents,
    termMonths: r.termMonths,
    employmentTenure: r.employmentTenure,
    status: r.status,
    rejectionReason: r.rejectionReason,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    bureauStatus: r.bureauStatus,
    bureauScore: r.bureauScore,
    bureauAttempts: r.bureauAttempts,
    bureauCheckedAt: r.bureauCheckedAt?.toISOString() ?? null,
    bureauError: r.bureauError,
    createdById: r.createdById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Solicitud con el nombre del asesor que la registró, cuando la consulta lo trae. */
type RequestRow = CreditRequest & { createdBy?: { name: string } | null };

export type RequestDTO = ReturnType<typeof baseDto> & {
  /** Nombre del asesor de crédito que registró la solicitud. Solo viene en las consultas que lo piden. */
  createdByName?: string;
};

/** Convierte una solicitud al formato de la API. */
export function serializeRequest(r: RequestRow): RequestDTO {
  const dto = baseDto(r);
  return r.createdBy ? { ...dto, createdByName: r.createdBy.name } : dto;
}

export async function startReview(db: Db, actor: Actor, id: string, comment?: string) {
  assertAnalyst(actor);
  return db.$transaction(async (tx) => {
    const updated = await transition(tx, id, "CREADA", "EN_REVISION");
    await recordTransition(tx, {
      requestId: id,
      actor,
      fromStatus: "CREADA",
      toStatus: "EN_REVISION",
      comment: comment?.trim() || "Solicitud tomada para revisión",
    });
    return serializeRequest(updated);
  });
}

export interface DecisionOptions {
  idempotencyKey: string;
  comment?: string;
}

export async function approveRequest(db: Db, actor: Actor, id: string, opts: DecisionOptions) {
  assertAnalyst(actor);
  return runIdempotent(db, { key: opts.idempotencyKey, userId: actor.id, action: "approve", requestId: id }, async (tx) => {
    const now = new Date();
    const approved = await transition(
      tx,
      id,
      "EN_REVISION",
      "APROBADA",
      { bureauStatus: "COMPLETADO" },
      { decidedAt: now },
    );

    // Descuento atómico y condicional: nunca deja el presupuesto en negativo.
    const { count } = await tx.budget.updateMany({
      where: { id: BUDGET_ID, availableCents: { gte: approved.amountCents } },
      data: { availableCents: { decrement: approved.amountCents } },
    });
    if (count === 0) {
      const budget = await tx.budget.findUnique({ where: { id: BUDGET_ID } });
      throw new DomainError(
        "INSUFFICIENT_BUDGET",
        `Presupuesto insuficiente: disponible ${formatMoney(budget?.availableCents ?? 0)}, solicitado ${formatMoney(approved.amountCents)}`,
      );
    }
    const budget = await tx.budget.findUniqueOrThrow({ where: { id: BUDGET_ID } });

    await recordTransition(tx, {
      requestId: id,
      actor,
      fromStatus: "EN_REVISION",
      toStatus: "APROBADA",
      comment: opts.comment?.trim() || `Aprobada por ${formatMoney(approved.amountCents)}`,
    });
    return { request: serializeRequest(approved), budget: { availableCents: budget.availableCents } };
  });
}

export async function rejectRequest(
  db: Db,
  actor: Actor,
  id: string,
  opts: { idempotencyKey: string; reason: unknown },
) {
  assertAnalyst(actor);
  const { reason } = rejectSchema.parse({ reason: opts.reason });
  return runIdempotent(db, { key: opts.idempotencyKey, userId: actor.id, action: "reject", requestId: id }, async (tx) => {
    const rejected = await transition(tx, id, "EN_REVISION", "RECHAZADA", {}, {
      decidedAt: new Date(),
      rejectionReason: reason,
    });
    await recordTransition(tx, {
      requestId: id,
      actor,
      fromStatus: "EN_REVISION",
      toStatus: "RECHAZADA",
      comment: reason,
    });
    return { request: serializeRequest(rejected) };
  });
}
