import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-helpers";
import { urgentSchema } from "@/domain/rules";
import { setUrgent } from "@/server/services/workflow";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("ANALISTA");
    const id = await routeId(ctx.params);
    const { urgent } = await parseBody(request, urgentSchema);
    const updated = await setUrgent(prisma, user, id, urgent);
    return NextResponse.json({ request: updated });
  });
}
