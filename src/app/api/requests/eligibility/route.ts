import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { checkEligibility } from "@/server/services/credit-requests";
import { DomainError } from "@/domain/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    await requireUser("SOLICITANTE");
    const documentId = new URL(request.url).searchParams.get("documentId")?.trim() ?? "";
    if (documentId.length < 5 || documentId.length > 20) {
      throw new DomainError("VALIDATION", "Documento inválido");
    }
    return NextResponse.json(await checkEligibility(prisma, documentId));
  });
}
