import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { getBudget } from "@/server/services/budget";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser("ANALISTA");
    return NextResponse.json(await getBudget(prisma));
  });
}
