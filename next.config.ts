import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad para todas las rutas. La política CSP solo restringe lo que no puede romper
 * Next.js: quién puede incrustar la app, a dónde se envían formularios y qué `<base>` u objetos se cargan.
 * No fija `script-src` porque Next.js inyecta scripts en línea y exigiría nonces en cada petición.
 */
export const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Los navegadores ignoran HSTS cuando la respuesta llega por HTTP, así que no afecta a localhost.
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // El lint se ejecuta aparte (`npm run lint` y el CI); así el build de Docker no depende de él.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
