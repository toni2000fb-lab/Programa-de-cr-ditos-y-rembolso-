import type { CreditRequest, Prisma } from "@prisma/client";
import type { Db } from "@/server/db";
import { DomainError } from "@/domain/errors";
import { createRequestSchema, HISTORY_WINDOW_DAYS } from "@/domain/rules";
import { PENDING_STATUSES, STATUS_LABEL } from "@/domain/stateMachine";
import { toCents } from "@/domain/money";
import type { Actor } from "./types";
import { recordTransition } from "./audit";

type Tx = Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Regla de historial reciente: bloquea si el documento tiene, dentro de los últimos 30 días,
 * una solicitud pendiente (CREADA / EN_REVISION, por fecha de creación) o RECHAZADA
 * (por fecha de rechazo). Devuelve el motivo exacto o null.
 */
export async function findHistoryBlock(
  db: Db | Tx,
  documentId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const cutoff = new Date(now.getTime() - HISTORY_WINDOW_DAYS * DAY_MS);
  const blocking = await db.creditRequest.findFirst({
    where: {
      documentId,
      OR: [
        { status: { in: [...PENDING_STATUSES] }, createdAt: { gte: cutoff } },
        { status: "RECHAZADA", decidedAt: { gte: cutoff } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!blocking) return null;

  const refDate = blocking.status === "RECHAZADA" && blocking.decidedAt ? blocking.decidedAt : blocking.createdAt;
  const unblockDate = new Date(refDate.getTime() + HISTORY_WINDOW_DAYS * DAY_MS);
  if (blocking.status === "RECHAZADA") {
    return (
      `El documento ${documentId} tiene una solicitud RECHAZADA el ${isoDate(refDate)} ` +
      `(dentro de los últimos ${HISTORY_WINDOW_DAYS} días). Podrá registrar una nueva solicitud a partir del ${isoDate(unblockDate)}.`
    );
  }
  return (
    `El documento ${documentId} ya tiene una solicitud pendiente (estado ${STATUS_LABEL[blocking.status]}) ` +
    `creada el ${isoDate(refDate)}. Debe resolverse antes de registrar una nueva solicitud.`
  );
}

export async function checkEligibility(db: Db, rawDocumentId: string, now = new Date()) {
  const documentId = rawDocumentId.trim().toUpperCase();
  const reason = await findHistoryBlock(db, documentId, now);
  return { documentId, eligible: reason === null, reason };
}

export async function createCreditRequest(
  db: Db,
  actor: Actor,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<CreditRequest> {
  if (actor.role !== "SOLICITANTE") {
    throw new DomainError("FORBIDDEN", "Sólo un solicitante puede registrar solicitudes");
  }
  const input = createRequestSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    // Serializa creaciones concurrentes del mismo documento para que la regla de
    // historial no pueda saltarse con dos envíos simultáneos.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.documentId}))`;

    const reason = await findHistoryBlock(tx, input.documentId, now);
    if (reason) throw new DomainError("HISTORY_BLOCK", reason);

    const created = await tx.creditRequest.create({
      data: {
        applicantName: input.applicantName,
        documentId: input.documentId,
        monthlyIncomeCents: toCents(input.monthlyIncome),
        amountCents: toCents(input.amount),
        termMonths: input.termMonths,
        createdById: actor.id,
        createdAt: now,
      },
    });
    await recordTransition(tx, {
      requestId: created.id,
      actor,
      fromStatus: null,
      toStatus: "CREADA",
      comment: "Solicitud registrada",
    });
    return created;
  });
}

/** El solicitante sólo ve sus solicitudes; el analista ve todas. */
export function listRequestsFor(db: Db, actor: Actor) {
  return db.creditRequest.findMany({
    where: actor.role === "ANALISTA" ? {} : { createdById: actor.id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export async function getRequestFor(db: Db, actor: Actor, id: string) {
  const request = await db.creditRequest.findUnique({ where: { id } });
  if (!request || (actor.role !== "ANALISTA" && request.createdById !== actor.id)) {
    throw new DomainError("NOT_FOUND", "Solicitud no encontrada");
  }
  return request;
}
