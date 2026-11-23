import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/errors";
import { clientIp, enforceRateLimit, RateLimiter, resetRateLimits } from "@/server/rate-limit";

describe("RateLimiter (ventana fija)", () => {
  it("permite hasta el límite y bloquea la petición siguiente", () => {
    const limiter = new RateLimiter(3, 60_000);
    const results = [0, 1, 2, 3].map(() => limiter.check("a", 1_000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
  });

  it("informa cuántos segundos faltan para que se libere", () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.check("a", 0);
    expect(limiter.check("a", 10_000).retryAfterSeconds).toBe(50);
    expect(limiter.check("a", 59_900).retryAfterSeconds).toBe(1);
  });

  it("la ventana se reinicia cuando pasa el tiempo", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 59_999).allowed).toBe(false);
    expect(limiter.check("a", 60_000).allowed).toBe(true);
  });

  it("cada clave cuenta por separado", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 0).allowed).toBe(false);
  });

  it("no guarda más claves que el tope, aunque lleguen miles de IP distintas", () => {
    const limiter = new RateLimiter(5, 60_000, 100);
    for (let i = 0; i < 1_000; i++) limiter.check(`ip-${i}`, 0);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });

  it("al llenarse primero descarta las ventanas ya vencidas y conserva las vigentes", () => {
    const limiter = new RateLimiter(1, 1_000, 3);
    limiter.check("vieja-1", 0);
    limiter.check("vieja-2", 0);
    limiter.check("vigente", 5_000);
    limiter.check("nueva", 5_500); // el Map está lleno: salen las dos vencidas
    expect(limiter.size).toBe(2);
    expect(limiter.check("vigente", 5_600).allowed).toBe(false); // su contador sobrevivió
  });
});

describe("enforceRateLimit", () => {
  const rule = { name: "prueba", limit: 2, windowMs: 60_000 };

  beforeEach(resetRateLimits);
  afterEach(() => vi.unstubAllEnvs());

  it("lanza RATE_LIMITED (429) con el tiempo de espera al superar el límite", () => {
    enforceRateLimit(rule, "k", 0);
    enforceRateLimit(rule, "k", 0);
    let error: unknown;
    try {
      enforceRateLimit(rule, "k", 20_000);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DomainError);
    const domain = error as DomainError;
    expect(domain.code).toBe("RATE_LIMITED");
    expect(domain.httpStatus).toBe(429);
    expect(domain.details).toEqual({ retryAfterSeconds: 40 });
  });

  it("las reglas no comparten contador aunque usen la misma clave", () => {
    const otra = { name: "otra", limit: 1, windowMs: 60_000 };
    enforceRateLimit(otra, "k", 0);
    expect(() => enforceRateLimit(rule, "k", 0)).not.toThrow();
    expect(() => enforceRateLimit(otra, "k", 0)).toThrow(DomainError);
  });

  it("RATE_LIMIT_DISABLED=true lo desactiva", () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");
    for (let i = 0; i < 10; i++) expect(() => enforceRateLimit(rule, "k", 0)).not.toThrow();
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/x", { headers });

  it("usa el primer valor de X-Forwarded-For", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("si no está, usa X-Real-IP", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("sin cabeceras de proxy todas las peticiones comparten un mismo cubo", () => {
    expect(clientIp(req({}))).toBe("desconocida");
  });

  it("recorta valores absurdamente largos", () => {
    expect(clientIp(req({ "x-forwarded-for": "9".repeat(500) }))).toHaveLength(64);
  });
});
