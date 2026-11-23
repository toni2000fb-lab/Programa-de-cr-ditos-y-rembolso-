import { SESSION_TTL_SECONDS } from "./session";

type Env = Record<string, string | undefined>;

function viaHttps(request: Request): boolean {
  // Detrás de un proxy que termina el TLS, la petición llega a la app por HTTP y el proxy avisa
  // del protocolo original en esta cabecera.
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * ¿Debe la cookie de sesión llevar el atributo `Secure`?
 *
 * - `COOKIE_SECURE=true` o `false` manda siempre.
 * - Sin esa variable, en producción es `Secure` en cuanto la petición llega por HTTPS, así que un
 *   despliegue con TLS queda protegido sin configurar nada.
 * - Por HTTP no se marca: algunos navegadores descartan una cookie `Secure` recibida por HTTP y el
 *   inicio de sesión dejaría de funcionar al probar con `http://localhost` en Docker.
 */
export function cookieIsSecure(request: Request, env: Env = process.env): boolean {
  const forced = env.COOKIE_SECURE?.trim().toLowerCase();
  if (forced === "true") return true;
  if (forced === "false") return false;
  if (env.NODE_ENV !== "production") return false;
  return viaHttps(request);
}

export function sessionCookieOptions(request: Request, maxAge = SESSION_TTL_SECONDS, env: Env = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieIsSecure(request, env),
    path: "/",
    maxAge,
  };
}
