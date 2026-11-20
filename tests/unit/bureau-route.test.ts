import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/bureau/[documentId]/route";
import { BUREAU_TOKEN_HEADER, bureauToken, isValidBureauToken } from "@/server/services/bureau-auth";

const original = { secret: process.env.SESSION_SECRET, token: process.env.BUREAU_API_TOKEN };

beforeAll(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-suficientemente-largo";
  delete process.env.BUREAU_API_TOKEN;
});

afterAll(() => {
  if (original.secret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = original.secret;
  if (original.token === undefined) delete process.env.BUREAU_API_TOKEN;
  else process.env.BUREAU_API_TOKEN = original.token;
});

const call = (documentId: string, token?: string) =>
  GET(
    new Request(`http://localhost/api/bureau/${documentId}`, { headers: token ? { [BUREAU_TOKEN_HEADER]: token } : {} }),
    { params: Promise.resolve({ documentId }) },
  );

describe("Credencial del servicio de buró", () => {
  it("responde 401 sin token o con un token incorrecto, sin esperar la latencia simulada", async () => {
    expect((await call("ABC12345")).status).toBe(401);
    expect((await call("ABC12345", "token-incorrecto")).status).toBe(401);
  });

  it("con el token correcto supera la guarda (un documento inválido responde 400 al instante)", async () => {
    expect((await call("ab", bureauToken())).status).toBe(400);
  });

  it("responde 500 si el servidor no tiene ninguna credencial configurada", async () => {
    const secret = process.env.SESSION_SECRET;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    delete process.env.SESSION_SECRET;
    try {
      expect((await call("ABC12345", "cualquier-cosa")).status).toBe(500);
    } finally {
      process.env.SESSION_SECRET = secret;
      log.mockRestore();
    }
  });

  it("el token se deriva de SESSION_SECRET y puede fijarse con BUREAU_API_TOKEN", () => {
    const derived = bureauToken();
    expect(isValidBureauToken(derived)).toBe(true);
    expect(isValidBureauToken(null)).toBe(false);

    process.env.BUREAU_API_TOKEN = "token-explicito-0123456789";
    try {
      expect(bureauToken()).toBe("token-explicito-0123456789");
      expect(isValidBureauToken("token-explicito-0123456789")).toBe(true);
      expect(isValidBureauToken(derived)).toBe(false);
    } finally {
      delete process.env.BUREAU_API_TOKEN;
    }
  });
});
