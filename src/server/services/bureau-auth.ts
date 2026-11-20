import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * El buró simulado representa un servicio externo, así que exige una credencial propia en lugar
 * de quedar abierto a cualquiera que conozca la URL. El cliente (`fetchBureauReport`) la envía
 * en esta cabecera.
 */
export const BUREAU_TOKEN_HEADER = "x-internal-token";

/**
 * Credencial compartida entre la app y el servicio de buró. Si no se define `BUREAU_API_TOKEN`
 * se deriva de `SESSION_SECRET`, de modo que no hace falta configuración extra y nunca queda
 * un valor por defecto conocido.
 */
export function bureauToken(): string {
  const explicit = process.env.BUREAU_API_TOKEN;
  if (explicit && explicit.length >= 16) return explicit;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("Define BUREAU_API_TOKEN o SESSION_SECRET (mínimo 16 caracteres)");
  }
  return createHmac("sha256", secret).update("bureau-internal-token-v1").digest("base64url");
}

export function isValidBureauToken(given: string | null): boolean {
  if (!given) return false;
  const expected = Buffer.from(bureauToken());
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
