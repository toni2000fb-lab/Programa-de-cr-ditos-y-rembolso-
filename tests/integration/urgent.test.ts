import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DomainError } from "@/domain/errors";
import { approveRequest, setUrgent } from "@/server/services/workflow";
import { analista, analista2, db, requestInReview, seedActors, setBudget, solicitante } from "./helpers";

beforeAll(seedActors);
beforeEach(() => setBudget(5_000_000));
afterAll(() => db.$disconnect());

const entries = (requestId: string) => db.auditLog.findMany({ where: { requestId }, orderBy: { id: "asc" } });

describe("Marca de urgente (BD real)", () => {
  it("marcar y desmarcar cambia el valor y deja una entrada de auditoría cada vez", async () => {
    const id = await requestInReview(1_000);
    const before = (await entries(id)).length;

    const on = await setUrgent(db, analista, id, true);
    expect(on.urgent).toBe(true);
    const off = await setUrgent(db, analista2, id, false);
    expect(off.urgent).toBe(false);

    const added = (await entries(id)).slice(before);
    expect(added).toHaveLength(2);
    expect(added.map((e) => e.comment)).toEqual(["Marcada como urgente", "Se quitó la marca de urgente"]);
    // No es un cambio de estado: el estado anterior y el nuevo son el mismo.
    for (const e of added) {
      expect(e.fromStatus).toBe("EN_REVISION");
      expect(e.toStatus).toBe("EN_REVISION");
    }
    expect(added.map((e) => e.actorId)).toEqual([analista.id, analista2.id]);
  });

  it("pedir el valor que ya tiene no cambia nada ni deja rastro", async () => {
    const id = await requestInReview(1_000);
    await setUrgent(db, analista, id, true);
    const before = (await entries(id)).length;

    const again = await setUrgent(db, analista, id, true);
    expect(again.urgent).toBe(true);
    expect(await setUrgent(db, analista, id, true)).toEqual(again);
    expect((await entries(id)).length).toBe(before);
  });

  it("funciona sobre una solicitud recién creada y no altera su estado", async () => {
    const created = await db.creditRequest.create({
      data: {
        applicantName: "Cliente Nuevo",
        documentId: `U${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        monthlyIncomeCents: 300_000,
        amountCents: 100_000,
        termMonths: 12,
        createdById: solicitante.id,
      },
    });
    const marked = await setUrgent(db, analista, created.id, true);
    expect(marked.status).toBe("CREADA");
    expect(marked.urgent).toBe(true);
    expect((await entries(created.id))[0]).toMatchObject({ fromStatus: "CREADA", toStatus: "CREADA" });
  });

  it("20 marcas simultáneas dejan una sola entrada de auditoría", async () => {
    const id = await requestInReview(1_000);
    const before = (await entries(id)).length;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => setUrgent(db, i % 2 ? analista : analista2, id, true)),
    );
    expect(results.every((r) => r.urgent === true)).toBe(true);
    expect((await entries(id)).length).toBe(before + 1);
  });

  it("un solicitante no puede marcarla", async () => {
    const id = await requestInReview(1_000);
    await expect(setUrgent(db, solicitante, id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.creditRequest.findUniqueOrThrow({ where: { id } })).urgent).toBe(false);
  });

  it("no se puede cambiar una vez resuelta la solicitud", async () => {
    const id = await requestInReview(1_000);
    await setUrgent(db, analista, id, true);
    await approveRequest(db, analista, id, { idempotencyKey: randomUUID() });

    const err = await setUrgent(db, analista, id, false).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("INVALID_TRANSITION");
    // La marca previa queda como estaba: no se modifica el historial de una solicitud cerrada.
    expect((await db.creditRequest.findUniqueOrThrow({ where: { id } })).urgent).toBe(true);
  });

  it("una solicitud inexistente responde NOT_FOUND", async () => {
    await expect(setUrgent(db, analista, randomUUID(), true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
