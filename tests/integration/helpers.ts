import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Actor } from "@/server/services/types";
import { createCreditRequest } from "@/server/services/credit-requests";
import { startReview } from "@/server/services/workflow";

export const db = new PrismaClient();

export const solicitante: Actor = { id: "t-sol", name: "Sol Test", role: "SOLICITANTE" };
export const solicitante2: Actor = { id: "t-sol-2", name: "Sol Dos", role: "SOLICITANTE" };
export const analista: Actor = { id: "t-ana", name: "Ana Test", role: "ANALISTA" };
export const analista2: Actor = { id: "t-ana-2", name: "Otro Analista", role: "ANALISTA" };

export async function seedActors() {
  for (const a of [solicitante, solicitante2, analista, analista2]) {
    await db.user.upsert({ where: { id: a.id }, update: {}, create: a });
  }
}

export async function setBudget(cents: number) {
  await db.budget.upsert({
    where: { id: 1 },
    update: { availableCents: cents, initialCents: cents },
    create: { id: 1, availableCents: cents, initialCents: cents },
  });
}

export function uniqueDoc() {
  return `T${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/** Crea una solicitud, la pasa a EN_REVISION y marca el buró como completado. */
export async function requestInReview(amount: number, documentId = uniqueDoc()) {
  const created = await createCreditRequest(db, solicitante, {
    applicantName: "Cliente Prueba",
    documentId,
    monthlyIncome: amount * 3,
    amount,
    termMonths: 12,
  });
  await db.creditRequest.update({ where: { id: created.id }, data: { bureauStatus: "COMPLETADO", bureauScore: 720 } });
  await startReview(db, analista, created.id);
  return created.id;
}
