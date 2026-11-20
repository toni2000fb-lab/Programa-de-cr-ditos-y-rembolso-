import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DomainError } from "@/domain/errors";
import { approveRequest, rejectRequest } from "@/server/services/workflow";
import { analista, analista2, db, requestInReview, seedActors, setBudget, solicitante } from "./helpers";

beforeAll(seedActors);
beforeEach(() => setBudget(5_000_000));
afterAll(() => db.$disconnect());

async function budget() {
  return (await db.budget.findUniqueOrThrow({ where: { id: 1 } })).availableCents;
}

describe("Aprobación concurrente (BD real)", () => {
  it("20 aprobaciones simultáneas de la misma solicitud: sólo una descuenta presupuesto", async () => {
    const id = await requestInReview(1_000);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        approveRequest(db, i % 2 ? analista : analista2, id, { idempotencyKey: randomUUID() }),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(19);
    for (const f of failed) expect((f.reason as DomainError).code).toBe("ALREADY_PROCESSED");

    expect(await budget()).toBe(5_000_000 - 100_000);
    const approvals = await db.auditLog.count({ where: { requestId: id, toStatus: "APROBADA" } });
    expect(approvals).toBe(1);
  });

  it("doble clic con la misma clave de idempotencia devuelve la misma respuesta sin repetir el efecto", async () => {
    const id = await requestInReview(2_000);
    const key = randomUUID();

    const [a, b] = await Promise.all([
      approveRequest(db, analista, id, { idempotencyKey: key }),
      approveRequest(db, analista, id, { idempotencyKey: key }),
    ]);
    expect(a.body).toEqual(b.body);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);

    const again = await approveRequest(db, analista, id, { idempotencyKey: key });
    expect(again.replayed).toBe(true);
    expect(await budget()).toBe(5_000_000 - 200_000);
  });

  it("solicitudes distintas compitiendo por el mismo presupuesto nunca lo dejan negativo", async () => {
    await setBudget(1_000_000); // $10,000
    const ids = await Promise.all(Array.from({ length: 5 }, () => requestInReview(4_000))); // 5 × $4,000

    const results = await Promise.allSettled(
      ids.map((id) => approveRequest(db, analista, id, { idempotencyKey: randomUUID() })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(ok).toHaveLength(2);
    for (const f of failed) expect((f.reason as DomainError).code).toBe("INSUFFICIENT_BUDGET");
    expect(await budget()).toBe(200_000);
    // Las rechazadas por presupuesto siguen EN_REVISION (la transacción se revirtió completa).
    expect(await db.creditRequest.count({ where: { id: { in: ids }, status: "EN_REVISION" } })).toBe(3);
  });
});

describe("Transiciones y permisos", () => {
  it("no permite aprobar una solicitud rechazada ni rechazar sin motivo suficiente", async () => {
    const id = await requestInReview(500);

    await expect(rejectRequest(db, analista, id, { idempotencyKey: randomUUID(), reason: "corto" })).rejects.toThrow(
      "15 caracteres",
    );
    await rejectRequest(db, analista, id, { idempotencyKey: randomUUID(), reason: "Ingresos no verificables con soporte" });

    await expect(approveRequest(db, analista, id, { idempotencyKey: randomUUID() })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect(await budget()).toBe(5_000_000);
  });

  it("un solicitante no puede aprobar", async () => {
    const id = await requestInReview(500);
    await expect(approveRequest(db, solicitante, id, { idempotencyKey: randomUUID() })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("el registro de auditoría es inmutable a nivel de base de datos", async () => {
    const id = await requestInReview(500);
    const entry = await db.auditLog.findFirstOrThrow({ where: { requestId: id } });
    await expect(db.auditLog.update({ where: { id: entry.id }, data: { comment: "alterado" } })).rejects.toThrow(
      /inmutable/,
    );
    await expect(db.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/inmutable/);
  });
});
