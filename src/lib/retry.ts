export interface RetryOptions {
  /** Intentos totales (incluido el primero). */
  maxAttempts: number;
  /** Espera base en ms; se duplica en cada reintento. */
  baseDelayMs: number;
  /** Espera máxima por reintento. */
  maxDelayMs: number;
  /** Proporción de jitter aleatorio (0–1) para evitar reintentos sincronizados. */
  jitter?: number;
  /** Decide si un error es transitorio y vale la pena reintentar. */
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export class RetryExhaustedError extends Error {
  constructor(
    readonly attempts: number,
    readonly lastError: unknown,
  ) {
    super(`Se agotaron los ${attempts} intentos`);
    this.name = "RetryExhaustedError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Espera de backoff exponencial para el reintento n (1 = primer reintento). */
export function backoffDelay(retryNumber: number, opts: RetryOptions, random = Math.random): number {
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (retryNumber - 1));
  const jitter = opts.jitter ?? 0;
  return Math.round(exp * (1 - jitter + jitter * random()));
}

/** Ejecuta `fn` con reintentos controlados y espera progresiva (backoff exponencial). */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<{ value: T; attempts: number }> {
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = opts.shouldRetry ? opts.shouldRetry(error) : true;
      if (!retryable) throw error;
      if (attempt === opts.maxAttempts) break;
      const delayMs = backoffDelay(attempt, opts, random);
      opts.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw new RetryExhaustedError(opts.maxAttempts, lastError);
}
