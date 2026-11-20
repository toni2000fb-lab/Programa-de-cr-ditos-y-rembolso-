import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { approveRequest } from "@/server/services/workflow";
import { IDEMPOTENCY_TTL_MS, pruneExpiredKeys } from "@/server/services/idempotency";
import { analista, db, requestInReview, seedActors, setBudget } from "./helpers";

beforeAll(seedActors);
beforeEach(() => setBudget(5_000_000));
afterAll(() => db.$disconnect());

const storedKey = (key: string, createdAt: Date) => ({
  key,
  userId: analista.id,
  action: "approve",
  requestId: randomUUID(),
  statusCode: 200,
  response: {},
  createdAt,
});

describe("Caducidad de las claves de idempotencia", () => {
  it("pruneExpiredKeys borra sólo las claves de más de 24 h", async () => {
    const old = `viejo-${randomUUID()}`;
    const fresh = `reciente-${randomUUID()}`;
    await db.idempotencyKey.createMany({
      data: [
        storedKey(old, new Date(Date.now() - IDEMPOTENCY_TTL_MS - 60_000)),
        storedKey(fresh, new Date(Date.now() - 60_000)),
      ],
    });

    expect(await pruneExpiredKeys(db)).toBeGreaterThanOrEqual(1);
    expect(await db.idempotencyKey.findUnique({ where: { key: old } })).toBeNull();
    expect(await db.idempotencyKey.findUnique({ where: { key: fresh } })).not.toBeNull();
  });

  it("una decisión completada limpia las claves caducadas sin tocar la suya", async () => {
    const old = `viejo-${randomUUID()}`;
    await db.idempotencyKey.create({ data: storedKey(old, new Date(Date.now() - 2 * IDEMPOTENCY_TTL_MS)) });

    const id = await requestInReview(500);
    const key = randomUUID();
    await approveRequest(db, analista, id, { idempotencyKey: key });

    expect(await db.idempotencyKey.findUnique({ where: { key: old } })).toBeNull();
    expect(await db.idempotencyKey.findUnique({ where: { key } })).not.toBeNull();
  });
});
