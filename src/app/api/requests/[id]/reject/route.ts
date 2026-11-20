import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { idempotencyKey, routeId } from "@/server/route-helpers";
import { rejectRequest } from "@/server/services/workflow";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("ANALISTA");
    const id = await routeId(ctx.params);
    const key = idempotencyKey(request);
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const result = await rejectRequest(prisma, user, id, { idempotencyKey: key, reason: body.reason });
    return NextResponse.json(result.body, {
      status: result.statusCode,
      headers: { "Idempotent-Replayed": String(result.replayed) },
    });
  });
}
