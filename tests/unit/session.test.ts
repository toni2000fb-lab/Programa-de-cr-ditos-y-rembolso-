import { beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/server/auth/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-suficientemente-largo";
});

describe("Sesión firmada", () => {
  it("acepta un token válido y rechaza uno manipulado o expirado", () => {
    const token = createSessionToken("u-sol-ana");
    expect(verifySessionToken(token)).toBe("u-sol-ana");

    const [data, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "u-ana-carla", exp: 9_999_999_999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifySessionToken(`${data}.x${sig}`)).toBeNull();
    expect(verifySessionToken(token, Date.now() + 9 * 60 * 60 * 1000)).toBeNull();
  });
});
