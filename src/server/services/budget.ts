import type { Db } from "@/server/db";
import { INITIAL_BUDGET_CENTS } from "@/domain/rules";

export const BUDGET_ID = 1;

export async function getBudget(db: Db) {
  const budget = await db.budget.upsert({
    where: { id: BUDGET_ID },
    update: {},
    create: { id: BUDGET_ID, initialCents: INITIAL_BUDGET_CENTS, availableCents: INITIAL_BUDGET_CENTS },
  });
  return {
    initialCents: budget.initialCents,
    availableCents: budget.availableCents,
    committedCents: budget.initialCents - budget.availableCents,
    updatedAt: budget.updatedAt.toISOString(),
  };
}
