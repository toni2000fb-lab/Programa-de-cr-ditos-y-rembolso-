import { NextResponse, after } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-helpers";
import { startReview } from "@/server/services/workflow";
import { runBureauCheck } from "@/server/services/bureau";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("ANALISTA");
    const id = await routeId(ctx.params);
    const body = (await request.json().catch(() => ({}))) as { comment?: unknown };
    const comment = typeof body.comment === "string" ? body.comment.slice(0, 1000) : undefined;
    const updated = await startReview(prisma, user, id, comment);
    if (updated.bureauStatus === "NO_CONSULTADO" || updated.bureauStatus === "FALLIDO") {
      after(() => runBureauCheck(prisma, id).catch((e) => console.error("[buró]", e)));
    }
    return NextResponse.json({ request: updated });
  });
}
