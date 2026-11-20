import { NextResponse } from "next/server";
import { simulateBureau } from "@/server/services/bureau";
import { BUREAU_TOKEN_HEADER, isValidBureauToken } from "@/server/services/bureau-auth";

export const dynamic = "force-dynamic";

/**
 * Simulación de un Buró Crediticio externo: latencia de 2–4 s y ~30% de respuestas 503.
 * Como servicio externo exige su propia credencial (cabecera x-internal-token); sin ella no
 * revela puntajes ni retiene una petición durante segundos.
 */
export async function GET(request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  let authorized: boolean;
  try {
    authorized = isValidBureauToken(request.headers.get(BUREAU_TOKEN_HEADER));
  } catch (error) {
    console.error("[buró] configuración de credenciales inválida", error);
    return NextResponse.json({ error: "Servicio mal configurado" }, { status: 500 });
  }
  if (!authorized) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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
