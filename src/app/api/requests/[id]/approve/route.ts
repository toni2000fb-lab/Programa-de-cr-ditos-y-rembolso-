import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { idempotencyKey, routeId } from "@/server/route-helpers";
import { approveRequest } from "@/server/services/workflow";
import { approveSchema } from "@/domain/rules";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("ANALISTA");
    enforceRateLimit(RATE_LIMITS.decision, user.id);
    const id = await routeId(ctx.params);
    const key = idempotencyKey(request);
    const { comment } = approveSchema.parse(await request.json().catch(() => ({})));
    const result = await approveRequest(prisma, user, id, { idempotencyKey: key, comment });
    return NextResponse.json(result.body, {
      status: result.statusCode,
      headers: { "Idempotent-Replayed": String(result.replayed) },
    });
  });
}
