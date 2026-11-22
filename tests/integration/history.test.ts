import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createCreditRequest } from "@/server/services/credit-requests";
import { rejectRequest, startReview } from "@/server/services/workflow";
import { clientProfileInput } from "../fixtures";
import { analista, db, seedActors, solicitante, uniqueDoc } from "./helpers";

beforeAll(seedActors);
afterAll(() => db.$disconnect());

const input = (documentId: string) => ({
  applicantName: "Cliente Historial",
  documentId,
  employmentTenure: "DE_1_A_3_ANIOS",
  monthlyIncome: 5000,
  amount: 1000,
  termMonths: 24,
  ...clientProfileInput(),
});

describe("Restricción por historial reciente (30 días)", () => {
  it("bloquea si hay una solicitud pendiente del mismo documento, incluso con envíos simultáneos", async () => {
    const doc = uniqueDoc();
    const results = await Promise.allSettled([
      createCreditRequest(db, solicitante, input(doc)),
      createCreditRequest(db, solicitante, input(doc)),
      createCreditRequest(db, solicitante, input(doc)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "HISTORY_BLOCK" });
    expect(String((rejected?.reason as Error).message)).toContain("pendiente");
  });

  it("bloquea durante 30 días tras un rechazo, con el motivo exacto, y luego permite", async () => {
    const doc = uniqueDoc();
    const created = await createCreditRequest(db, solicitante, input(doc));
    await startReview(db, analista, created.id);
    await rejectRequest(db, analista, created.id, { idempotencyKey: randomUUID(), reason: "Capacidad de pago insuficiente" });

    await expect(createCreditRequest(db, solicitante, input(doc))).rejects.toThrow(/RECHAZADA.*Podrá registrar/);

    const in31Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    await expect(createCreditRequest(db, solicitante, input(doc), in31Days)).resolves.toMatchObject({ status: "CREADA" });
  });

  it("valida el 40% también en el servidor", async () => {
    await expect(
      createCreditRequest(db, solicitante, { ...input(uniqueDoc()), monthlyIncome: 1000, amount: 400.01 }),
    ).rejects.toThrow(/40%/);
  });
});
