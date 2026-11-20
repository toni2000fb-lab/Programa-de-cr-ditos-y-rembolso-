import { NextResponse } from "next/server";
import { simulateBureau } from "@/server/services/bureau";

export const dynamic = "force-dynamic";

/**
 * Simulación de un Buró Crediticio externo: latencia de 2–4 s y ~30% de respuestas 503.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await ctx.params;
  if (!/^[A-Za-z0-9-]{5,20}$/.test(documentId)) {
    return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  }
  const result = await simulateBureau(documentId.toUpperCase());
  if (!result.ok) {
    return NextResponse.json(
      { error: "Service Unavailable" },
      { status: 503, headers: { "Retry-After": "1" } },
    );
  }
  return NextResponse.json(result.report);
}
