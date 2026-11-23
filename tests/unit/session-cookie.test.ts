import { describe, expect, it } from "vitest";
import { sessionCookieOptions, cookieIsSecure } from "@/server/auth/cookie";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
const http = req("http://localhost:3000/api/auth/login");
const https = req("https://creditos.example.com/api/auth/login");
const behindProxy = req("http://app:3000/api/auth/login", { "x-forwarded-proto": "https" });

describe("Atributo Secure de la cookie de sesión", () => {
  it("en producción es Secure cuando la petición llega por HTTPS, sin configurar nada", () => {
    expect(cookieIsSecure(https, { NODE_ENV: "production" })).toBe(true);
  });

  it("en producción es Secure detrás de un proxy que termina el TLS (X-Forwarded-Proto)", () => {
    expect(cookieIsSecure(behindProxy, { NODE_ENV: "production" })).toBe(true);
  });

  it("en producción por HTTP no es Secure, para que el login con http://localhost siga funcionando", () => {
    expect(cookieIsSecure(http, { NODE_ENV: "production" })).toBe(false);
  });

  it("si el proxy dice que el cliente usó HTTP, manda eso aunque la URL interna sea https", () => {
    const plain = req("https://app:3000/x", { "x-forwarded-proto": "http" });
    expect(cookieIsSecure(plain, { NODE_ENV: "production" })).toBe(false);
  });

  it("con varios proxies se toma el protocolo del primero", () => {
    const chain = req("http://app:3000/x", { "x-forwarded-proto": "https, http" });
    expect(cookieIsSecure(chain, { NODE_ENV: "production" })).toBe(true);
  });

  it("en desarrollo y en pruebas no es Secure", () => {
    expect(cookieIsSecure(https, { NODE_ENV: "development" })).toBe(false);
    expect(cookieIsSecure(https, { NODE_ENV: "test" })).toBe(false);
    expect(cookieIsSecure(https, {})).toBe(false);
  });

  it("COOKIE_SECURE=true la fuerza siempre y COOKIE_SECURE=false la desactiva siempre", () => {
    expect(cookieIsSecure(http, { NODE_ENV: "development", COOKIE_SECURE: "true" })).toBe(true);
    expect(cookieIsSecure(https, { NODE_ENV: "production", COOKIE_SECURE: "false" })).toBe(false);
    expect(cookieIsSecure(https, { NODE_ENV: "production", COOKIE_SECURE: " TRUE " })).toBe(true);
  });

  it("un valor desconocido en COOKIE_SECURE cae en el comportamiento por defecto", () => {
    expect(cookieIsSecure(https, { NODE_ENV: "production", COOKIE_SECURE: "quizas" })).toBe(true);
    expect(cookieIsSecure(http, { NODE_ENV: "production", COOKIE_SECURE: "" })).toBe(false);
  });
});

describe("Opciones de la cookie de sesión", () => {
  it("siempre es httpOnly, SameSite=Lax y de toda la app", () => {
    expect(sessionCookieOptions(http, 100, {})).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 100,
    });
  });

  it("incluye el Secure calculado", () => {
    expect(sessionCookieOptions(https, 100, { NODE_ENV: "production" }).secure).toBe(true);
    expect(sessionCookieOptions(http, 100, { NODE_ENV: "production" }).secure).toBe(false);
  });
});
