import { DomainError } from "@/domain/errors";

/**
 * Límite de peticiones en memoria, de ventana fija. Protege el inicio de sesión y las decisiones
 * (aprobar/rechazar) de ráfagas de peticiones, por ejemplo un bucle o un botón pulsado sin parar.
 *
 * Es por proceso: con varias réplicas de la app cada una cuenta aparte. Para un despliegue con
 * varias instancias habría que mover el contador a Redis o a la base de datos.
 */
export interface RateLimitRule {
  /** Nombre del cubo; cada regla cuenta por separado. */
  name: string;
  /** Peticiones permitidas dentro de la ventana. */
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  /** Por dirección IP. Generoso: el selector de usuarios de prueba no tiene contraseña. */
  login: { name: "login", limit: 30, windowMs: 60_000 },
  /** Por analista autenticado. Una persona no aprueba ni rechaza más de una vez por segundo. */
  decision: { name: "decision", limit: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    /** Tope de claves guardadas, para que una avalancha de IP distintas no llene la memoria. */
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    let current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.makeRoom(now);
      current = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, current);
    }
    current.count += 1;
    return {
      allowed: current.count <= this.limit,
      remaining: Math.max(0, this.limit - current.count),
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  /** Cantidad de claves guardadas (para las pruebas). */
  get size(): number {
    return this.windows.size;
  }

  private makeRoom(now: number): void {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
    // Si todas siguen vigentes se descartan las más antiguas (el Map conserva el orden de inserción).
    for (const key of this.windows.keys()) {
      if (this.windows.size < this.maxKeys) break;
      this.windows.delete(key);
    }
  }
}

// Un solo contador por proceso aunque Next cargue este módulo desde varias rutas.
const globalForLimits = globalThis as unknown as { rateLimiters?: Map<string, RateLimiter> };
const limiters = (globalForLimits.rateLimiters ??= new Map());

function limiterFor(rule: RateLimitRule): RateLimiter {
  let limiter = limiters.get(rule.name);
  if (!limiter || limiter.limit !== rule.limit || limiter.windowMs !== rule.windowMs) {
    limiter = new RateLimiter(rule.limit, rule.windowMs);
    limiters.set(rule.name, limiter);
  }
  return limiter;
}

/**
 * IP del cliente según las cabeceras que añade un proxy inverso. Si la app se expone sin proxy esas
 * cabeceras las controla quien llama, así que el límite por IP solo es fiable detrás de uno.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : "desconocida";
}

/** Lanza `RATE_LIMITED` (HTTP 429) cuando `key` supera la regla. `RATE_LIMIT_DISABLED=true` lo apaga. */
export function enforceRateLimit(rule: RateLimitRule, key: string, now = Date.now()): void {
  if (process.env.RATE_LIMIT_DISABLED === "true") return;
  const result = limiterFor(rule).check(`${rule.name}:${key}`, now);
  if (!result.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      `Demasiadas peticiones. Intenta de nuevo en ${result.retryAfterSeconds} segundos.`,
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}

/** Solo para las pruebas: vacía los contadores. */
export function resetRateLimits(): void {
  limiters.clear();
}
