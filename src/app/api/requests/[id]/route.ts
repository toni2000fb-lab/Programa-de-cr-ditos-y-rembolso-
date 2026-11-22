import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-helpers";
import { getRequestDetail } from "@/server/services/request-detail";

export const dynamic = "force-dynamic";

/** Detalle completo de una solicitud y de su cliente. Solo para analistas. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("ANALISTA");
    const id = await routeId(ctx.params);
    return NextResponse.json(await getRequestDetail(prisma, user, id));
  });
}
