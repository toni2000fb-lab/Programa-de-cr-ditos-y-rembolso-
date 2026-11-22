import { NextResponse, after } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { createCreditRequest, listRequestsFor } from "@/server/services/credit-requests";
import { serializeRequest } from "@/server/services/workflow";
import { runBureauCheck } from "@/server/services/bureau";
import { DomainError } from "@/domain/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const requests = await listRequestsFor(prisma, user);
    return NextResponse.json({ requests: requests.map((r) => serializeRequest(r)) });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("SOLICITANTE");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("VALIDATION", "El cuerpo de la petición debe ser JSON válido");
    }
    const created = await createCreditRequest(prisma, user, body);
    // La consulta al buró (2–4 s + reintentos) se ejecuta tras responder: no bloquea al usuario.
    after(async () => {
      try {
        await runBureauCheck(prisma, created.id);
      } catch (e) {
        console.error("[buró] consulta en segundo plano falló", e);
      }
    });
    return NextResponse.json({ request: serializeRequest(created) }, { status: 201 });
  });
}
