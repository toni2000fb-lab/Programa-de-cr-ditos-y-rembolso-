import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "../../next.config";

describe("Cabeceras de seguridad", () => {
  const byKey = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));

  it("se aplican a todas las rutas, incluida la raíz y la API", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe("/:path*");
    expect(rules[0]!.headers).toEqual(securityHeaders);
  });

  it("impiden incrustar la app en otro sitio (clickjacking)", () => {
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("evitan que el navegador adivine tipos de contenido y limitan el Referer", () => {
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("la política CSP no fija script-src ni style-src, porque rompería los scripts en línea de Next.js", () => {
    const csp = byKey["Content-Security-Policy"]!;
    expect(csp).not.toMatch(/script-src|style-src|default-src/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("no repite ninguna cabecera", () => {
    expect(new Set(securityHeaders.map((h) => h.key)).size).toBe(securityHeaders.length);
  });

  it("no anuncia el framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
