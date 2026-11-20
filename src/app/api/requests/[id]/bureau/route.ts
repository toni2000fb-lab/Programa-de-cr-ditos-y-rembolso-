import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-helpers";
import { runBureauCheck } from "@/server/services/bureau";

export const maxDuration = 60;

/** Reconsulta manual del buró (analista). Responde cuando termina la consulta con reintentos. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser("ANALISTA");
    const id = await routeId(ctx.params);
    return NextResponse.json({ request: await runBureauCheck(prisma, id) });
  });
}
