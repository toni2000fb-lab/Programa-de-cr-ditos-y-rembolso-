import type { Db } from "@/server/db";
import { DomainError } from "@/domain/errors";
import { withRetry, RetryExhaustedError, type RetryOptions } from "@/lib/retry";
import { BUREAU_STALE_MS } from "@/domain/rules";
import { serializeRequest } from "./workflow";
import { BUREAU_TOKEN_HEADER, bureauToken } from "./bureau-auth";

// ---------------------------------------------------------------------------
// Simulador del servicio externo (usado por GET /api/bureau/[documentId])
// ---------------------------------------------------------------------------

export interface BureauReport {
  documentId: string;
  score: number; // 300–850
  activeDebts: number;
  consultedAt: string;
}

export const BUREAU_MIN_LATENCY_MS = 2000;
export const BUREAU_MAX_LATENCY_MS = 4000;
export const BUREAU_FAILURE_RATE = 0.3;

/** Puntaje determinista por documento para que consultas repetidas sean coherentes. */
export function deterministicScore(documentId: string): number {
  let h = 0;
  for (const ch of documentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 300 + (h % 551);
}

export async function simulateBureau(
  documentId: string,
  deps: { random?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ ok: true; report: BureauReport } | { ok: false }> {
  const random = deps.random ?? Math.random;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  await sleep(BUREAU_MIN_LATENCY_MS + random() * (BUREAU_MAX_LATENCY_MS - BUREAU_MIN_LATENCY_MS));
  if (random() < BUREAU_FAILURE_RATE) return { ok: false };
  const score = deterministicScore(documentId);
  return {
    ok: true,
    report: {
      documentId,
      score,
      activeDebts: score % 4,
      consultedAt: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Cliente resiliente
// ---------------------------------------------------------------------------

export class BureauHttpError extends Error {
  constructor(readonly status: number) {
    super(`El buró respondió HTTP ${status}`);
    this.name = "BureauHttpError";
  }
}

export const BUREAU_RETRY: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  jitter: 0.3,
};
export const BUREAU_ATTEMPT_TIMEOUT_MS = 6000;

/** Sólo se reintentan fallos transitorios: 5xx, 429, timeouts y errores de red. */
export function isTransientBureauError(error: unknown): boolean {
  if (error instanceof BureauHttpError) return error.status >= 500 || error.status === 429;
  return true; // TypeError de red, AbortError por timeout, etc.
}

export interface BureauClientDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  retry?: Partial<RetryOptions>;
  attemptTimeoutMs?: number;
  /** Token interno para el servicio de buró (por defecto, el derivado de la configuración). */
  token?: string;
}

export async function fetchBureauReport(documentId: string, deps: BureauClientDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? process.env.BUREAU_BASE_URL ?? "http://127.0.0.1:3000";
  const timeout = deps.attemptTimeoutMs ?? BUREAU_ATTEMPT_TIMEOUT_MS;
  const url = `${baseUrl}/api/bureau/${encodeURIComponent(documentId)}`;
  const token = deps.token ?? bureauToken();

  return withRetry<BureauReport>(
    async () => {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeout),
        cache: "no-store",
        headers: { [BUREAU_TOKEN_HEADER]: token },
      });
      if (!res.ok) throw new BureauHttpError(res.status);
      return (await res.json()) as BureauReport;
    },
    {
      ...BUREAU_RETRY,
      ...deps.retry,
      shouldRetry: isTransientBureauError,
      onRetry: ({ attempt, delayMs, error }) =>
        console.warn(
          `[buró] intento ${attempt} falló (${error instanceof Error ? error.message : String(error)}); reintento en ${delayMs} ms`,
        ),
    },
  );
}

/**
 * Consulta el buró para una solicitud y persiste el resultado. Marca la solicitud como
 * CONSULTANDO con una actualización condicional para no lanzar dos consultas a la vez.
 */
export async function runBureauCheck(db: Db, requestId: string, deps: BureauClientDeps = {}) {
  const request = await db.creditRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new DomainError("NOT_FOUND", "Solicitud no encontrada");
  if (request.status === "APROBADA" || request.status === "RECHAZADA") {
    throw new DomainError("INVALID_TRANSITION", "La solicitud ya fue resuelta; no requiere nueva consulta de buró");
  }

  const { count } = await db.creditRequest.updateMany({
    where: {
      id: requestId,
      OR: [
        { bureauStatus: { not: "CONSULTANDO" } },
        { updatedAt: { lt: new Date(Date.now() - BUREAU_STALE_MS) } },
      ],
    },
    data: { bureauStatus: "CONSULTANDO", bureauError: null },
  });
  if (count === 0) {
    return serializeRequest(await db.creditRequest.findUniqueOrThrow({ where: { id: requestId } }));
  }

  try {
    const { value, attempts } = await fetchBureauReport(request.documentId, deps);
    const updated = await db.creditRequest.update({
      where: { id: requestId },
      data: {
        bureauStatus: "COMPLETADO",
        bureauScore: value.score,
        bureauAttempts: { increment: attempts },
        bureauCheckedAt: new Date(),
        bureauError: null,
      },
    });
    return serializeRequest(updated);
  } catch (error) {
    const attempts = error instanceof RetryExhaustedError ? error.attempts : 1;
    const message =
      error instanceof RetryExhaustedError
        ? `Servicio de buró no disponible tras ${attempts} intentos`
        : `Error consultando el buró: ${error instanceof Error ? error.message : String(error)}`;
    const updated = await db.creditRequest.update({
      where: { id: requestId },
      data: { bureauStatus: "FALLIDO", bureauAttempts: { increment: attempts }, bureauError: message },
    });
    return serializeRequest(updated);
  }
}
