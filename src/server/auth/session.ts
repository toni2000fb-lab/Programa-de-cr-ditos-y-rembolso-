import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sesión firmada con HMAC-SHA256. La cookie sólo contiene el id del usuario y la
 * expiración; el rol SIEMPRE se lee de la base de datos en el servidor, por lo que
 * manipular la cookie no permite escalar privilegios (la firma deja de ser válida).
 */
export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

interface SessionPayload {
  uid: string;
  exp: number; // epoch seconds
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET no está configurado (mínimo 16 caracteres)");
  }
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(userId: string, nowMs = Date.now()): string {
  const payload: SessionPayload = { uid: userId, exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string | undefined, nowMs = Date.now()): string | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < nowMs) return null;
    return payload.uid;
  } catch {
    return null;
  }
}
