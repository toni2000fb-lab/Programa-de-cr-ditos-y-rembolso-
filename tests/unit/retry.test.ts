import { describe, expect, it, vi } from "vitest";
import { backoffDelay, RetryExhaustedError, withRetry } from "@/lib/retry";
import { fetchBureauReport } from "@/server/services/bureau";

const noSleep = () => Promise.resolve();

describe("Resiliencia ante el buró (reintentos con backoff exponencial)", () => {
  it("reintenta los 503 y devuelve el resultado cuando el servicio se recupera", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ documentId: "ABC12345", score: 700, activeDebts: 0, consultedAt: "x" }));

    const { value, attempts } = await fetchBureauReport("ABC12345", {
      fetchImpl,
      baseUrl: "http://bureau.test",
      retry: { sleep: noSleep },
    });
    expect(value.score).toBe(700);
    expect(attempts).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("no reintenta errores 4xx (no transitorios)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 400 }));
    await expect(
      fetchBureauReport("ABC12345", { fetchImpl, baseUrl: "http://bureau.test", retry: { sleep: noSleep } }),
    ).rejects.toThrow("HTTP 400");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("se rinde tras el máximo de intentos con esperas crecientes", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("503"));
    await expect(
      withRetry(fn, {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        sleep: async (ms) => void delays.push(ms),
      }),
    ).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([100, 200, 400]);
    expect(backoffDelay(10, { maxAttempts: 1, baseDelayMs: 100, maxDelayMs: 1000 })).toBe(1000);
  });
});
