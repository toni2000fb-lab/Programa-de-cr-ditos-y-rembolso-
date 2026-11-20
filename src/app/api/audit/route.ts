import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { listAudit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireUser("ANALISTA");
    const requestId = new URL(request.url).searchParams.get("requestId") ?? undefined;
    return NextResponse.json({ entries: await listAudit(prisma, { requestId }) });
  });
}
