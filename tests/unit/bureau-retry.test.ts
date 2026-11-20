import { describe, expect, it } from "vitest";
import { canRetryBureau } from "@/domain/bureau";
import { BUREAU_STALE_MS } from "@/domain/rules";

const now = Date.parse("2026-11-20T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("Reintento manual del buró (consultas atascadas)", () => {
  it("siempre permite reintentar una consulta FALLIDA mientras la solicitud no esté resuelta", () => {
    expect(canRetryBureau({ status: "CREADA", bureauStatus: "FALLIDO", updatedAt: ago(1_000) }, now)).toBe(true);
    expect(canRetryBureau({ status: "EN_REVISION", bureauStatus: "FALLIDO", updatedAt: ago(1_000) }, now)).toBe(true);
  });

  it("no ofrece el reintento mientras la consulta avanza con normalidad", () => {
    expect(canRetryBureau({ status: "EN_REVISION", bureauStatus: "CONSULTANDO", updatedAt: ago(10_000) }, now)).toBe(false);
    // el umbral es estricto: justo en el límite todavía se considera en curso
    expect(canRetryBureau({ status: "EN_REVISION", bureauStatus: "CONSULTANDO", updatedAt: ago(BUREAU_STALE_MS) }, now)).toBe(false);
  });

  it("permite relanzar una consulta que lleva más de 60 s sin avanzar (p. ej. el servidor se reinició)", () => {
    const stale = ago(BUREAU_STALE_MS + 1);
    expect(canRetryBureau({ status: "EN_REVISION", bureauStatus: "CONSULTANDO", updatedAt: stale }, now)).toBe(true);
    expect(canRetryBureau({ status: "EN_REVISION", bureauStatus: "NO_CONSULTADO", updatedAt: stale }, now)).toBe(true);
  });

  it("nunca se ofrece con el buró completado ni en solicitudes ya resueltas", () => {
    const stale = ago(10 * BUREAU_STALE_MS);
    expect(canRetryBureau({ status: "EN_REVISION", bureauStatus: "COMPLETADO", updatedAt: stale }, now)).toBe(false);
    expect(canRetryBureau({ status: "APROBADA", bureauStatus: "FALLIDO", updatedAt: stale }, now)).toBe(false);
    expect(canRetryBureau({ status: "RECHAZADA", bureauStatus: "CONSULTANDO", updatedAt: stale }, now)).toBe(false);
  });
});
